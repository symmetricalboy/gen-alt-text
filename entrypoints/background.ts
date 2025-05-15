import browser from 'webextension-polyfill';

// Assuming ffmpeg.js UMD is loaded globally or via importScripts.
// The actual ffmpeg.js and ffmpeg-core.js/wasm should be in /public/assets/ffmpeg/

// const FFMPEG_SCRIPT_URL = browser.runtime.getURL('assets/ffmpeg/ffmpeg.js'); // Removed
// const FFMPEG_CORE_URL = browser.runtime.getURL('assets/ffmpeg/ffmpeg-core.js'); // Removed
// let ffmpeg = null; // Removed

const CLOUD_FUNCTION_URL = 'https://us-central1-symm-gemini.cloudfunctions.net/generateAltTextProxy';
const SINGLE_FILE_DIRECT_LIMIT = 19 * 1024 * 1024; // 19MB
const MAX_CHUNKS = 15; // Safety limit for chunks, already defined in my mental model for the previous full script.

let contentScriptPort = null;

// --- Offscreen Document Logic ---
const OFFSCRREN_DOCUMENT_PATH = 'offscreen.html'; // Path to the offscreen document HTML

// A map to store Promise resolvers for ongoing FFmpeg operations
const ffmpegOperations = new Map();
let operationIdCounter = 0;


// Check if an offscreen document exists.
async function hasOffscreenDocument() {
    // @ts-ignore: chrome.offscreen may not be fully typed in webextension-polyfill yet
    if (chrome.offscreen && chrome.offscreen.hasDocument) {
        // @ts-ignore
        const existing = await chrome.offscreen.hasDocument();
        if (existing) console.log('[Background] Offscreen document exists.');
        else console.log('[Background] No offscreen document found.');
        return existing;
    }
    // Fallback check using getContexts (less reliable for specific path)
    console.log('[Background] chrome.offscreen.hasDocument not available, using getContexts fallback.');
    // @ts-ignore
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [browser.runtime.getURL(OFFSCRREN_DOCUMENT_PATH)]
    });
    return contexts && contexts.length > 0;
}

// Create and setup the offscreen document if it doesn't already exist.
async function setupOffscreenDocument() {
    const docExists = await hasOffscreenDocument();
    if (!docExists) {
        console.log('[Background] Creating offscreen document...');
        // @ts-ignore
        await chrome.offscreen.createDocument({
            url: OFFSCRREN_DOCUMENT_PATH,
            reasons: ['BLOBS', 'USER_MEDIA'], // Corrected BLOB to BLOBS
            justification: 'FFmpeg processing for media files.',
        });
        console.log('[Background] Offscreen document requested for creation.');
        // After creation, we can send a message to trigger FFmpeg load within it.
        // The offscreen document should then message back its status.
        // This part could be a promise that resolves when FFmpeg is confirmed loaded in offscreen.
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Timeout waiting for offscreen FFmpeg to load.'));
                chrome.runtime.onMessage.removeListener(initialLoadListener);
            }, 60000); // Increased timeout to 60 seconds

            const initialLoadListener = (message, sender) => {
                if (message.type === 'ffmpegStatusOffscreen' && sender.url && sender.url.endsWith(OFFSCRREN_DOCUMENT_PATH)) {
                    clearTimeout(timeoutId);
                    chrome.runtime.onMessage.removeListener(initialLoadListener);
                    if (message.payload && message.payload.status === 'FFmpeg loaded in offscreen.') {
                        console.log('[Background] Received confirmation: FFmpeg loaded in offscreen document.');
                        resolve(true);
                    } else {
                        console.error('[Background] Offscreen document reported FFmpeg load failure:', message.payload?.error);
                        reject(new Error(message.payload?.error || 'Offscreen FFmpeg load failed.'));
                    }
                }
            };
            chrome.runtime.onMessage.addListener(initialLoadListener);
            console.log('[Background] Sending loadFFmpegOffscreen to offscreen document.');
            chrome.runtime.sendMessage({ target: 'offscreen', type: 'loadFFmpegOffscreen' })
                .catch(err => { // Catch error if sendMessage itself fails (e.g., no listener)
                    clearTimeout(timeoutId);
                    chrome.runtime.onMessage.removeListener(initialLoadListener);
                    console.error('[Background] Error sending loadFFmpegOffscreen message:', err);
                    reject(new Error('Failed to send initial load message to offscreen document. It might not have loaded yet.'));
                });
        });
    } else {
        console.log('[Background] Offscreen document confirmed to already exist.');
        return true; // Already exists
    }
}


// Listener for messages FROM the Offscreen Document (and other parts of extension if any)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.url && sender.url.endsWith(OFFSCRREN_DOCUMENT_PATH)) { // Message from our offscreen document
        if (message.type === 'ffmpegLogOffscreen') {
            const { type, message: logMessage } = message.payload;
            if (contentScriptPort) {
                contentScriptPort.postMessage({ type: 'ffmpegLog', message: '[FFMPEG Offscreen ' + type + '] ' + logMessage });
            }
            // console.log(`[FFMPEG Log Offscreen ${type}] ${logMessage}`); // Avoid duplicate console logs if offscreen also logs
        } else if (message.type === 'ffmpegResultOffscreen') {
            console.log('[Background] Received ffmpegResultOffscreen:', message.payload);
            const { operationId, success, data, error, fileName } = message.payload;
            if (ffmpegOperations.has(operationId)) {
                const { resolve, reject } = ffmpegOperations.get(operationId);
                if (success) {
                    resolve({ success: true, data, fileName });
                } else {
                    reject(new Error(error || 'Unknown FFmpeg offscreen error.'));
                }
                ffmpegOperations.delete(operationId);
            } else {
                console.warn("[Background] Unknown operationId received."); 
            }
        }
         // Handle initial load confirmation if not caught by specific setupOffscreenDocument promise
        else if (message.type === 'ffmpegStatusOffscreen' && message.payload && message.payload.status === 'FFmpeg loaded in offscreen.') {
            console.log('[Background] General listener caught FFmpeg loaded confirmation from offscreen.');
        }
    }
    // Keep channel open for other listeners or async responses if this listener doesn't send one.
    // If sendResponse is used, it should be returned true from the event handler.
    // Since we're not using sendResponse here for messages from offscreen, it's fine.
    return true; 
});

async function runFFmpegInOffscreen(command, inputFile, outputFileName) {
    await setupOffscreenDocument(); // Ensure offscreen doc is ready and FFmpeg loaded within it.
    
    const id = operationIdCounter++;
    const arrayBuffer = inputFile.data;
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        console.error('[Background] runFFmpegInOffscreen: inputFile.data is not an ArrayBuffer!', inputFile.data);
        throw new Error('Internal: inputFile.data must be an ArrayBuffer for runFFmpegInOffscreen.');
    }

    const promise = new Promise((resolve, reject) => {
        ffmpegOperations.set(id, { resolve, reject });

        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'runFFmpegOffscreen',
            payload: {
                operationId: id,
                command,
                inputFile: { name: inputFile.name, data: arrayBuffer }, // Pass ArrayBuffer
                outputFileName,
            },
        }, response => { // Optional callback for sendMessage
            if (chrome.runtime.lastError) {
                console.error('[Background] Error sending runFFmpegOffscreen (opId ' + id + '):', chrome.runtime.lastError.message);
                ffmpegOperations.delete(id);
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && !response.success) { // If offscreen doc immediately responds with an error
                console.error('[Background] Offscreen document reported immediate error for opId ' + id + ':', response.error);
                ffmpegOperations.delete(id);
                reject(new Error(response.error || "Offscreen document failed to start FFmpeg operation."));
            } else {
                // console.log('[Background] runFFmpegOffscreen message sent for opId ' + id + ', response:', response);
            }
        }).catch(err => { // Catch if sendMessage promise itself rejects (e.g. document closed)
             console.error('[Background] sendMessage promise rejected for opId ' + id + ':', err);
             ffmpegOperations.delete(id);
             reject(err);
        });
    });

    // Timeout for the operation
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            if (ffmpegOperations.has(id)) {
                ffmpegOperations.delete(id);
                reject(new Error('FFmpeg operation (opId ' + id + ') timed out for ' + outputFileName));
            }
        }, 120000); // 120 seconds timeout
    });

    return Promise.race([promise, timeoutPromise]);
}

// --- End Offscreen Document Logic ---

async function getMediaDurationViaFFmpeg(inputFilePayload: { name: string, data: ArrayBuffer, type: string }, port: chrome.runtime.Port): Promise<number> {
    port.postMessage({ type: 'progress', message: `Checking media duration for ${inputFilePayload.name}...` });
    const tempInputName = `input_${Date.now()}_${inputFilePayload.name}`;
    try {
        const result = await runFFmpegInOffscreen(
            ['get_duration'], 
            { name: tempInputName, data: inputFilePayload.data }, // Pass data for initial write with a unique name
            `${tempInputName}_duration_check` // Nominal output name
        );

        if (result && typeof result.duration === 'number') {
            if (result.duration > 0) {
                 port.postMessage({ type: 'progress', message: `Duration found: ${result.duration.toFixed(2)}s for ${inputFilePayload.name}` });
            } else {
                 port.postMessage({ type: 'progress', message: `Media ${inputFilePayload.name} has no significant duration or is a still image.` });
            }
            // The file 'tempInputName' now exists on FFmpeg's FS. Future operations should use this name.
            return result.duration; 
        }
        port.postMessage({ type: 'warning', message: `Could not determine duration for ${inputFilePayload.name} via FFmpeg.` });
        return 0;
    } catch (error) {
        console.error(`[Background] Error getting media duration for ${inputFilePayload.name}:`, error);
        port.postMessage({ type: 'error', message: `Failed to get duration for ${inputFilePayload.name}: ${error.message}` });
        // If duration check fails, try to clean up the potentially written temp file.
        // This is a best-effort cleanup.
        try {
            await runFFmpegCommandOnExistingFile(['delete_input_only'], tempInputName, `${tempInputName}_cleanup`, port, true);
        } catch (cleanupError) {
            console.warn(`[Background] Failed to cleanup ${tempInputName} after duration check error:`, cleanupError);
        }
        return 0;
    }
}

async function runFFmpegCommandOnExistingFile(
    command: string[], 
    existingInputFileNameOnFFmpegFS: string, 
    outputFileName: string, 
    port: chrome.runtime.Port,
    isDeleteOperation: boolean = false // Flag to indicate if this is primarily a delete op for cleanup
) {
    // Assumes existingInputFileNameOnFFmpegFS is already in FFmpeg's virtual FS in the offscreen document
    // For delete operations, outputFileName might be nominal.
    // The offscreen document's runFFmpegOffscreen will handle actual file deletion based on its promise chain.
    // This function just sends the command.
    if (!isDeleteOperation) { // Avoid spamming progress for delete ops
        port.postMessage({ type: 'progress', message: `Executing FFmpeg command for ${outputFileName}...` });
    }
    return runFFmpegInOffscreen(
        command,
        { name: existingInputFileNameOnFFmpegFS }, // No data, just name
        outputFileName
    );
}

// Function to explicitly delete a file from FFmpeg's FS in the offscreen document
async function deleteFileInOffscreen(fileNameOnFFmpegFS: string, port: chrome.runtime.Port) {
    port.postMessage({ type: 'progress', message: `Deleting ${fileNameOnFFmpegFS} from remote FFmpeg FS...`});
    try {
        // We need a way for the offscreen document to know this is just a delete operation.
        // Let's use a pseudo-command. The offscreen handler needs to be updated for this.
        // The outputFileName is nominal here.
        const result = await runFFmpegInOffscreen(
            ['delete_file_please', fileNameOnFFmpegFS], // Command and file to delete
            { name: fileNameOnFFmpegFS }, // Specify the file to operate on contextually
            `${fileNameOnFFmpegFS}_delete_op`
        );
        console.log(`[Background] Deletion result for ${fileNameOnFFmpegFS}:`, result);
        port.postMessage({ type: 'progress', message: `${fileNameOnFFmpegFS} deleted from FFmpeg FS.`});
        return true;
    } catch (error) {
        console.error(`[Background] Error deleting ${fileNameOnFFmpegFS} in offscreen:`, error);
        port.postMessage({ type: 'error', message: `Failed to delete ${fileNameOnFFmpegFS}: ${error.message}`});
        return false;
    }
}

async function loadFFmpeg(port) {
    if (ffmpeg && ffmpeg.loaded) {
        port.postMessage({ type: 'ffmpegStatus', status: 'FFmpeg already loaded.' });
        return ffmpeg;
    }
    port.postMessage({ type: 'ffmpegStatus', status: 'Loading FFmpeg library...' });
    console.log('[Background] Loading FFmpeg...');
    try {
        // @ts-ignore: FFmpeg might be loaded globally
        if (typeof self.FFmpeg === 'undefined' || typeof self.FFmpeg.FFmpeg === 'undefined') {
            console.log('[Background] FFmpeg not found directly on self, attempting to load from ' + FFMPEG_SCRIPT_URL);
            
            try {
                // Service workers need to use importScripts
                console.log('[Background] Using importScripts to load FFmpeg');
                importScripts(FFMPEG_SCRIPT_URL); // Use importScripts directly
                console.log('[Background] importScripts executed successfully');
            } catch (err) {
                console.error('[Background] Failed to load FFmpeg with importScripts:', err);
                throw new Error('Failed to load FFmpeg: ' + err.message);
            }

            // @ts-ignore
            if (typeof self.FFmpeg !== 'undefined' && typeof self.FFmpeg.FFmpeg !== 'undefined') {
                console.log('[Background] self.FFmpeg.FFmpeg IS available after loading.');
            // @ts-ignore Check for FFmpegWASM as per the UMD script provided by user
            } else if (typeof self.FFmpegWASM !== 'undefined' && typeof self.FFmpegWASM.FFmpeg !== 'undefined') {
                 console.log('[Background] self.FFmpegWASM.FFmpeg IS available. Using it.');
                 // @ts-ignore Assign FFmpegWASM to FFmpeg for consistent use if FFmpeg isn't directly populated
                 self.FFmpeg = self.FFmpegWASM; 
            } else {
                 console.error('[Background] Neither self.FFmpeg.FFmpeg nor self.FFmpegWASM.FFmpeg are available after loading.');
                 console.log('[Background] Properties on self:', Object.keys(self));
                 throw new Error('FFmpeg library not available on self after loading (FFmpeg or FFmpegWASM not found).');
            }
        }
        // @ts-ignore Now self.FFmpeg should point to the correct object (either original or FFmpegWASM)
        ffmpeg = new self.FFmpeg.FFmpeg();
        // @ts-ignore
        ffmpeg.on('log', ({ type, message }) => {
            // console.log(`FFmpeg [${type}]: ${message}`); // Verbose for dev
            port.postMessage({ type: 'ffmpegLog', message: '[FFMPEG ' + type + '] ' + message });
        });
        
        console.log('[Background] Attempting to load FFmpeg core from: ' + FFMPEG_CORE_URL)
        // @ts-ignore
        await ffmpeg.load({ coreURL: FFMPEG_CORE_URL });
        port.postMessage({ type: 'ffmpegStatus', status: 'FFmpeg loaded successfully.' });
        console.log('[Background] FFmpeg loaded successfully.');
        return ffmpeg;
    } catch (error) {
        console.error('[Background] Failed to load FFmpeg:', error);
        port.postMessage({ type: 'ffmpegStatus', status: 'Failed to load FFmpeg: ' + error.message, error: true });
        ffmpeg = null;
        return null;
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                return reject(new Error('FileReader did not return a string.'));
            }
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
}

// --- Placeholder Functions --- 
async function optimizeImageWithFFmpegInBackground(originalFilePayload: { name: string, type: string, size: number, arrayBuffer: ArrayBuffer }, port: chrome.runtime.Port): Promise<File | null> {
    port.postMessage({ type: 'progress', message: `Optimizing large image ${originalFilePayload.name} via Offscreen Document...` });
    const tempInputName = `input_${Date.now()}_${originalFilePayload.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const tempOutputName = `optimized_${Date.now()}_${(originalFilePayload.name.split('.')[0] || originalFilePayload.name).replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;

    try {
        // First, write the original file and run the optimization command.
        // runFFmpegInOffscreen handles the inputFile data write for the first command.
        const result = await runFFmpegInOffscreen(
            ['-i', tempInputName, '-vf', 'scale=w=min(2048\,iw):h=min(2048\,ih):force_original_aspect_ratio=decrease', '-q:v', '3', tempOutputName],
            { name: tempInputName, data: originalFilePayload.arrayBuffer }, // Pass data for initial write
            tempOutputName
        );

        if (result.success && result.data) {
            const optimizedBlob = new Blob([result.data], { type: 'image/jpeg' });
            // Use original name for the final File object for consistency with user expectations
            const finalFileName = `optimized_${originalFilePayload.name.split('.')[0]}.jpg`;
            const optimizedFile = new File([optimizedBlob], finalFileName, { type: 'image/jpeg' });

            if (optimizedFile.size > SINGLE_FILE_DIRECT_LIMIT) {
                port.postMessage({ type: 'warning', message: `Optimized image (${(optimizedFile.size / (1024 * 1024)).toFixed(1)}MB) is still larger than direct limit.` });
            }
            port.postMessage({ type: 'progress', message: `Image ${originalFilePayload.name} optimized to ${(optimizedFile.size / (1024 * 1024)).toFixed(1)}MB.` });
            // The offscreen document should have deleted tempInputName and tempOutputName as part of its runFFmpegOffscreen chain.
            return optimizedFile;
        } else {
            throw new Error(result.error || 'FFmpeg offscreen optimization failed to return data.');
        }
    } catch (error) {
        console.error(`[Background] Error optimizing image ${originalFilePayload.name} with FFmpeg via offscreen:`, error);
        port.postMessage({ type: 'error', message: `Error optimizing ${originalFilePayload.name} (offscreen): ${error.message}` });
        // Best-effort cleanup of tempInputName if it was written and an error occurred before offscreen could clean it.
        // Note: offscreen handler cleans up on success, this is for errors during the runFFmpegInOffscreen call itself or if it rejects badly.
        try { await deleteFileInOffscreen(tempInputName, port); } catch (e) { console.warn(`Cleanup failed for ${tempInputName}`);}
        return null;
    }
}

async function chunkFileWithFFmpegInBackground(
    originalFilePayload: { name: string, type: string, size: number, arrayBuffer: ArrayBuffer }, 
    port: chrome.runtime.Port
): Promise<File[] | null> {
    port.postMessage({ type: 'progress', message: `Preparing to chunk ${originalFilePayload.name} via Offscreen Document...` });

    const chunks: File[] = [];
    // Use a unique name for the file on FFmpeg's FS to avoid collisions if multiple operations happen.
    const tempInputNameOnFFmpegFS = `input_${Date.now()}_${originalFilePayload.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const baseOutputNameForChunks = `chunk_${Date.now()}_${(originalFilePayload.name.split('.')[0] || originalFilePayload.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const originalFileExtension = originalFilePayload.name.includes('.') ? 
                                  originalFilePayload.name.substring(originalFilePayload.name.lastIndexOf('.')) : 
                                  (originalFilePayload.type.startsWith('video/') ? '.mp4' : '.gif');

    let durationSeconds = 0;
    try {
        // Get duration and write the file to FFmpeg FS under tempInputNameOnFFmpegFS
        // getMediaDurationViaFFmpeg's first arg (inputFilePayload) provides the data for the initial write.
        // The name used internally by getMediaDurationViaFFmpeg for writing IS tempInputNameOnFFmpegFS due to its own construction.
        // This means we pass tempInputNameOnFFmpegFS also as the 'name' property in the first arg here so it matches what getMediaDuration uses.
        durationSeconds = await getMediaDurationViaFFmpeg(
            { name: tempInputNameOnFFmpegFS, data: originalFilePayload.arrayBuffer, type: originalFilePayload.type }, 
            port
        );

        const isEffectivelyVideoType = originalFilePayload.type.startsWith('video/') || originalFilePayload.type === 'image/gif';

        if (durationSeconds > 0 && isEffectivelyVideoType) {
            const avgBitrate = (originalFilePayload.size * 8) / durationSeconds;
            let segmentTargetDuration = Math.floor((SINGLE_FILE_DIRECT_LIMIT * 0.85 * 8) / avgBitrate); // Target 85% of limit
            segmentTargetDuration = Math.max(10, Math.min(segmentTargetDuration, 300)); // Clamp between 10s and 5min
            console.log(`[Background] Calculated segmentDuration for ${tempInputNameOnFFmpegFS}: ${segmentTargetDuration}s`);

            let startTime = 0;
            for (let i = 0; startTime < durationSeconds; i++) {
                if (chunks.length >= MAX_CHUNKS) {
                    port.postMessage({ type: 'warning', message: `Reached maximum chunk limit (${MAX_CHUNKS}) for ${originalFilePayload.name}.` });
                    break;
                }

                const outputChunkFileBaseName = `${baseOutputNameForChunks}_part${i + 1}`;
                let currentSegmentActualDuration = Math.min(segmentTargetDuration, durationSeconds - startTime);
                if (currentSegmentActualDuration < 1 && (durationSeconds - startTime) > 0.1) currentSegmentActualDuration = durationSeconds - startTime;
                if (currentSegmentActualDuration <= 0.1 && i > 0) break;

                port.postMessage({ type: 'progress', message: `Preparing chunk ${i + 1} for ${originalFilePayload.name}: ${currentSegmentActualDuration.toFixed(1)}s` });

                const copyOutputName = `${outputChunkFileBaseName}${originalFileExtension}`;
                const copyCommand = [
                    '-ss', '' + startTime,
                    '-i', tempInputNameOnFFmpegFS,
                    '-t', '' + currentSegmentActualDuration,
                    '-c', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    copyOutputName
                ];
                
                let chunkResult = await runFFmpegCommandOnExistingFile(copyCommand, tempInputNameOnFFmpegFS, copyOutputName, port);
                let chunkData = chunkResult.data; // ArrayBuffer
                let actualChunkFileName = chunkResult.fileName;
                let actualChunkType = originalFilePayload.type;

                if (chunkResult.success && chunkData && chunkData.byteLength > SINGLE_FILE_DIRECT_LIMIT * 1.05) {
                    port.postMessage({ type: 'progress', message: `Chunk ${i + 1} (copy) too large. Re-encoding ${originalFilePayload.name}...` });
                    const reEncodeOutputName = `${outputChunkFileBaseName}.mp4`; // Force mp4 for re-encode
                    const reEncodeCommand = [
                        '-ss', '' + startTime,
                        '-i', tempInputNameOnFFmpegFS,
                        '-t', '' + currentSegmentActualDuration,
                        '-fs', '' + SINGLE_FILE_DIRECT_LIMIT,
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                        '-c:a', 'aac', '-b:a', '96k',
                        '-avoid_negative_ts', 'make_zero',
                        reEncodeOutputName
                    ];
                    chunkResult = await runFFmpegCommandOnExistingFile(reEncodeCommand, tempInputNameOnFFmpegFS, reEncodeOutputName, port);
                    chunkData = chunkResult.data;
                    actualChunkFileName = chunkResult.fileName;
                    actualChunkType = 'video/mp4';
                }

                if (chunkResult.success && chunkData && chunkData.byteLength > 0) {
                    if (chunkData.byteLength > SINGLE_FILE_DIRECT_LIMIT * 1.05 && actualChunkType === 'video/mp4') {
                        port.postMessage({ type: 'warning', message: `Re-encoded chunk ${i + 1} for ${originalFilePayload.name} still too large. Skipping.` });
                    } else {
                        const chunkFile = new File([chunkData], actualChunkFileName, { type: actualChunkType });
                        chunks.push(chunkFile);
                        console.log(`[Background] Created chunk for ${originalFilePayload.name}: ${chunkFile.name}, size: ${chunkFile.size}`);
                    }
                } else if (!chunkResult.success) {
                    port.postMessage({ type: 'error', message: `Error creating chunk ${i + 1} for ${originalFilePayload.name}: ${chunkResult.error}` });
                }
                startTime += currentSegmentActualDuration;
            }
        } else if (originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT) {
            // Fallback for GIFs with no duration, or other large files not fitting video profile
            port.postMessage({ type: 'progress', message: `Attempting single size-based chunk for ${originalFilePayload.name}...` });
            const singleChunkOutputName = `${baseOutputNameForChunks}_part1${originalFileExtension}`;
            const singleChunkCommand = [
                '-i', tempInputNameOnFFmpegFS,
                '-fs', '' + SINGLE_FILE_DIRECT_LIMIT,
                '-c', 'copy', // Try to copy first
                singleChunkOutputName
            ];
            const result = await runFFmpegCommandOnExistingFile(singleChunkCommand, tempInputNameOnFFmpegFS, singleChunkOutputName, port);
            if (result.success && result.data && result.data.byteLength > 0) {
                const chunkFile = new File([result.data], result.fileName, { type: originalFilePayload.type });
                chunks.push(chunkFile);
                console.log(`[Background] Created single chunk for ${originalFilePayload.name}: ${chunkFile.name}`);
                if (chunkFile.size < originalFilePayload.size * 0.90 && originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT * 1.1) {
                    port.postMessage({ type: 'warning', message: `${originalFilePayload.name} was processed as a single part. Result might be partial if very large.`});
                }
            } else if (!result.success) {
                port.postMessage({ type: 'error', message: `Failed to create single chunk for ${originalFilePayload.name}: ${result.error}` });
            }
        }

        // After all operations, delete the initial temporary input file from FFmpeg FS
        await deleteFileInOffscreen(tempInputNameOnFFmpegFS, port);

    } catch (error) {
        console.error(`[Background] Error during chunking file ${originalFilePayload.name} with FFmpeg (offscreen):`, error);
        port.postMessage({ type: 'error', message: `Error chunking ${originalFilePayload.name}: ${error.message}` });
        // Attempt cleanup of the temp input file if an error occurred during the main try block
        try { await deleteFileInOffscreen(tempInputNameOnFFmpegFS, port); } catch (e) { console.warn(`Cleanup failed for ${tempInputNameOnFFmpegFS}`);}
        return null; // Indicate failure
    }

    if (chunks.length === 0 && originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT) {
        port.postMessage({ type: 'error', message: `No processable chunks were created from ${originalFilePayload.name}.` });
        return null;
    } else if (chunks.length === 0 && originalFilePayload.size <= SINGLE_FILE_DIRECT_LIMIT) {
        // If original was small and no FFmpeg processing happened (or failed but was small), return original as a single File
        port.postMessage({ type: 'progress', message: `${originalFilePayload.name} is small, processing directly.` });
        return [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, { type: originalFilePayload.type })];
    }

    port.postMessage({ type: 'progress', message: `File ${originalFilePayload.name} prepared into ${chunks.length} part(s).` });
    return chunks;
}

async function processSingleFileOrChunk(fileOrChunk, generationType, originalFilePayload, port, chunkMetadata = {}) {
    port.postMessage({ type: 'progress', message: 'Processing ' + fileOrChunk.name + ' for ' + generationType + '...' });
    console.log('[Background] Starting processSingleFileOrChunk:', { name: fileOrChunk.name, type: fileOrChunk.type, size: fileOrChunk.size, generationType });

    try {
        const base64 = await fileToBase64(fileOrChunk);
        if (!base64) {
            throw new Error('Failed to convert file to base64.');
        }

        let requestPayload = {
            base64Data: base64,
            mimeType: fileOrChunk.type, 
            fileName: originalFilePayload.name, 
            fileSize: fileOrChunk.size,
            isChunk: chunkMetadata.isChunk || false,
            chunkIndex: chunkMetadata.chunkIndex || 0,
            totalChunks: chunkMetadata.totalChunks || 0,
        };

        if (generationType === 'captions') {
            requestPayload.action = 'generateCaptions';
            if (chunkMetadata.videoMetadata && chunkMetadata.videoMetadata.duration) {
                requestPayload.duration = chunkMetadata.videoMetadata.duration;
            }
        } else { // altText
            const isOriginalVideo = originalFilePayload.type.startsWith('video/') || 
                                    ['image/gif', 'image/webp', 'image/apng'].includes(originalFilePayload.type);
            
            requestPayload.isVideo = isOriginalVideo || 
                                   fileOrChunk.type.startsWith('video/') || 
                                   ['image/gif', 'image/webp', 'image/apng'].includes(fileOrChunk.type);
            
            if (requestPayload.isVideo && chunkMetadata.videoMetadata) {
                 if (chunkMetadata.videoMetadata.duration) requestPayload.videoDuration = chunkMetadata.videoMetadata.duration;
                 if (chunkMetadata.videoMetadata.width) requestPayload.videoWidth = chunkMetadata.videoMetadata.width;
                 if (chunkMetadata.videoMetadata.height) requestPayload.videoHeight = chunkMetadata.videoMetadata.height;
            }
        }
        
        console.log('[Background] Sending to Cloud Function (' + CLOUD_FUNCTION_URL + '). Payload for ' + generationType + ':', 
            { ...requestPayload, base64Data: '(data length: ' + requestPayload.base64Data.length + ')' }
        );

        const response = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error('[Background] Cloud Function Error:', { status: response.status, data: responseData });
            const errorMsg = responseData.error || 'Cloud Function failed with status ' + response.status;
            port.postMessage({ type: 'error', message: 'API Error: ' + errorMsg, originalFileName: originalFilePayload.name });
            return { error: errorMsg, originalFileName: originalFilePayload.name }; 
        }
        
        port.postMessage({ type: 'progress', message: fileOrChunk.name + ' processed by API.' });
        console.log('[Background] Received from Cloud Function:', responseData);
        return responseData; 

    } catch (error) {
        console.error('[Background] Error in processSingleFileOrChunk for ' + fileOrChunk.name + ':', error);
        port.postMessage({ type: 'error', message: 'Processing error for ' + fileOrChunk.name + ': ' + error.message, originalFileName: originalFilePayload.name });
        return { error: error.message, originalFileName: originalFilePayload.name }; 
    }
}
// --- End Placeholder Functions ---

function base64ToArrayBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function handleProcessLargeMedia(payload, port) {
    console.log('[Background] handleProcessLargeMedia received payload:', payload);
    
    const { name: originalNameFromPayload, type: originalTypeFromPayload, size: originalSizeFromPayload, base64Data, generationType, videoMetadata } = payload; 

    let reconstructedArrayBuffer;
    if (typeof base64Data === 'string') {
        try {
            reconstructedArrayBuffer = base64ToArrayBuffer(base64Data);
        } catch (e) {
            port.postMessage({ type: 'error', message: 'Internal error: Failed to decode file data.', originalFileName: originalNameFromPayload || 'unknown' });
            return;
        }
    } else {
        port.postMessage({ type: 'error', message: 'Internal error: File data not received correctly.', originalFileName: originalNameFromPayload || 'unknown' });
        return;
    }

    // This is the definitive representation of the original file data received.
    const originalFilePayload = {
        name: originalNameFromPayload,
        type: originalTypeFromPayload,
        size: originalSizeFromPayload,
        arrayBuffer: reconstructedArrayBuffer 
    };

    console.log('[Background] Original file payload prepared:', {
        name: originalFilePayload.name,
        type: originalFilePayload.type,
        size: originalFilePayload.size,
        arrayBufferByteLength: originalFilePayload.arrayBuffer?.byteLength
    });
    
    try {
        await setupOffscreenDocument();
    } catch (setupError) {
        console.error('[Background] Failed to setup offscreen document for FFmpeg:', setupError);
        port.postMessage({ type: 'error', message: 'FFmpeg setup error: ' + setupError.message, originalFileName: originalFilePayload.name });
        return;
    }
    
    let filesToProcess: File[] | null = null; 

    if (originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT) {
        port.postMessage({ type: 'progress', message: `Large media ${originalFilePayload.name} detected. Applying processing strategy...` });

        const isStaticImageForAltText = generationType === 'altText' && 
                                    originalFilePayload.type.startsWith('image/') && 
                                    !['image/gif', 'image/webp', 'image/apng'].includes(originalFilePayload.type);

        if (isStaticImageForAltText) {
            const optimizedFile = await optimizeImageWithFFmpegInBackground(originalFilePayload, port); 
            if (optimizedFile) {
                filesToProcess = [optimizedFile]; 
            } else {
                // Optimization failed, proceed with original file as a single File object.
                filesToProcess = [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, {type: originalFilePayload.type})];
                port.postMessage({ type: 'warning', message: `Image optimization failed for ${originalFilePayload.name}. Will attempt to process original.` });
            }
        } else {
            // Not a static image for optimization, or it's a GIF/WEBP/APNG, or not for altText generation.
            // Proceed to check if it needs chunking or can be processed as a single file.
            filesToProcess = [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, {type: originalFilePayload.type})];
        }
        
        // Now, filesToProcess[0] is either the optimized image or the original file.
        // Check if this current file (which could be an optimized image or the original large media) needs chunking.
        const currentFileToConsiderForChunking = filesToProcess[0];
        const isChunkableType = currentFileToConsiderForChunking.type.startsWith('video/') || 
                                ['image/gif', 'image/webp', 'image/apng'].includes(currentFileToConsiderForChunking.type);

        if (currentFileToConsiderForChunking.size > SINGLE_FILE_DIRECT_LIMIT && isChunkableType) {
            port.postMessage({ type: 'progress', message: `Media ${currentFileToConsiderForChunking.name} requires chunking...` });
            // chunkFileWithFFmpegInBackground expects a payload with arrayBuffer.
            const payloadForChunking = {
                name: currentFileToConsiderForChunking.name,
                type: currentFileToConsiderForChunking.type,
                size: currentFileToConsiderForChunking.size,
                arrayBuffer: await currentFileToConsiderForChunking.arrayBuffer() 
            };
            const chunks = await chunkFileWithFFmpegInBackground(payloadForChunking, port); 
            if (chunks && chunks.length > 0) { 
                filesToProcess = chunks;
            } else if (chunks === null) { // Explicit failure from chunking
                port.postMessage({ type: 'error', message: `Failed to chunk media ${originalFilePayload.name}. Processing cannot continue.`, originalFileName: originalFilePayload.name });
                return; // Stop processing
            } else {
                // No chunks made, but not an explicit fail (e.g., file was smaller than thought after all or non-chunkable type)
                // filesToProcess remains as [currentFileToConsiderForChunking]
                port.postMessage({ type: 'progress', message: `Chunking not applied or yielded no parts for ${currentFileToConsiderForChunking.name}. Proceeding with it as a single file.` });
            }
        } else if (currentFileToConsiderForChunking.size > SINGLE_FILE_DIRECT_LIMIT && !isChunkableType) {
             port.postMessage({ type: 'warning', message: `Large file ${currentFileToConsiderForChunking.name} (${(currentFileToConsiderForChunking.size / (1024*1024)).toFixed(1)}MB) is not a chunkable type. Will be sent as is.` });
             // filesToProcess is already [currentFileToConsiderForChunking]
        }

    } else { // File is small enough, no FFmpeg pre-processing needed.
        filesToProcess = [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, {type: originalFilePayload.type})];
    }

    if (!filesToProcess || filesToProcess.length === 0) {
        port.postMessage({ type: 'error', message: `No files to process for ${originalFilePayload.name}. Workflow error.`, originalFileName: originalFilePayload.name });
        return;
    }

    const results = [];
    for (let i = 0; i < filesToProcess.length; i++) {
        const fileOrChunkToProcess = filesToProcess[i]; // This is a File object
        const chunkMeta = {
            isChunk: filesToProcess.length > 1,
            chunkIndex: i + 1,
            totalChunks: filesToProcess.length,
            videoMetadata: (fileOrChunkToProcess.type.startsWith('video/')) ? videoMetadata : null
        };
        
        // processSingleFileOrChunk expects a File object, and originalFilePayload for original file details
        const result = await processSingleFileOrChunk(fileOrChunkToProcess, generationType, originalFilePayload, port, chunkMeta);
        if (result && !result.error) {
            results.push(result);
        } else if (result && result.error) {
            // Error already posted by processSingleFileOrChunk
            return; 
        } else {
            port.postMessage({type: 'error', message: 'Unknown error processing chunk ' + (fileOrChunkToProcess.name || 'unknown chunk'), originalFileName: originalFilePayload.name});
            return;
        }
    }

    if (results.length > 0) {
        if (generationType === 'altText') {
            const combinedAltText = results.map(r => r.altText).join(' ').trim();
            port.postMessage({ type: 'altTextResult', altText: combinedAltText, originalFileName: originalFilePayload.name });
        } else if (generationType === 'captions') {
            const vttResults = results.map((r, index) => ({
                fileName: (originalFilePayload.name || 'media') + '_part' + (results.length > 1 ? (index+1) : '') + '.vtt'.replace(/_part_part/g, '_part').replace(/\\.vtt_part/g, '_part').replace(/_part\\./g, '.'),
                vttContent: r.vttContent
            }));
            port.postMessage({ type: 'captionResult', vttResults: vttResults, originalFileName: originalFilePayload.name });
        }
    } else if (filesToProcess.length > 0) { 
        port.postMessage({ type: 'warning', message: 'Processing complete, but no results were generated.', originalFileName: originalFilePayload.name });
    } else {
         port.postMessage({ type: 'warning', message: 'No files were processed.', originalFileName: originalFilePayload.name });
    }
}

// WXT entry point
export default {
  main() {
    console.log('[Background] Service worker main() executed. Setting up listeners for Offscreen Document pattern.');
    
    browser.runtime.onConnect.addListener((port) => {
        if (port.name === 'content-script-port') {
            contentScriptPort = port;
            console.log('[Background] Content script connected.');

            // Non-blocking initial attempt to set up the offscreen document and load FFmpeg within it.
            // Errors will be logged, and subsequent operations will retry setup if needed.
            setupOffscreenDocument().catch(err => {
                console.warn("[Background] Initial Offscreen Document setup/FFmpeg load failed on connect:", err.message);
                if (contentScriptPort) { // Inform content script if initial setup fails
                    contentScriptPort.postMessage({ type: 'ffmpegStatus', status: 'FFmpeg initial setup error: ' + err.message, error: true });
                }
            });

            port.onMessage.addListener(async (message) => {
                console.log('[Background] Received message from content script:', message.type);
                if (message.type === 'processLargeMedia') {
                    await handleProcessLargeMedia(message.payload, port);
                } else if (message.type === 'ping') {
                    port.postMessage({ type: 'pong' });
                }
            });

            port.onDisconnect.addListener(() => {
                console.log('[Background] Content script disconnected.');
                if (contentScriptPort === port) {
                    contentScriptPort = null;
                }
                // Optionally close offscreen document if no other connections or tasks
                // This requires more advanced logic to track active ports/operations.
                // For simplicity, leave it open for now. Chrome will close it after inactivity.
                // chrome.offscreen.closeDocument().catch(e => {}); 
            });
        }
    });
    console.log('[Background] onConnect listener attached.');
  },
};

console.log('[Background] Background script loaded (listeners will be set up in main when service worker executes).');
