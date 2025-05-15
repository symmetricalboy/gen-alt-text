import browser from 'webextension-polyfill';

// Assuming ffmpeg.js UMD is loaded globally or via importScripts.
// The actual ffmpeg.js and ffmpeg-core.js/wasm should be in /public/assets/ffmpeg/

let ffmpeg = null; // Will be instance of FFmpeg
// Construct URLs for assets in the public directory
const FFMPEG_SCRIPT_URL = browser.runtime.getURL('assets/ffmpeg/ffmpeg.js');
const FFMPEG_CORE_URL = browser.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');

const CLOUD_FUNCTION_URL = 'https://us-central1-symm-gemini.cloudfunctions.net/generateAltTextProxy';
const SINGLE_FILE_DIRECT_LIMIT = 19 * 1024 * 1024; // 19MB
const MAX_CHUNKS = 15; // Safety limit for chunks, already defined in my mental model for the previous full script.

let contentScriptPort = null;

async function loadFFmpeg(port) {
    if (ffmpeg && ffmpeg.loaded) {
        port.postMessage({ type: 'ffmpegStatus', status: 'FFmpeg already loaded.' });
        return ffmpeg;
    }
    port.postMessage({ type: 'ffmpegStatus', status: 'Loading FFmpeg library...' });
    console.log('[Background] Loading FFmpeg...');
    try {
        // @ts-ignore: FFmpeg might be loaded globally via manifest or importScripts
        if (typeof self.FFmpeg === 'undefined' || typeof self.FFmpeg.FFmpeg === 'undefined') {
            console.log(`[Background] FFmpeg not found on self, attempting importScripts from ${FFMPEG_SCRIPT_URL}`);
            importScripts(FFMPEG_SCRIPT_URL); 
            // @ts-ignore
            if (typeof self.FFmpeg === 'undefined' || typeof self.FFmpeg.FFmpeg === 'undefined') {
                throw new Error('FFmpeg library still not available after importScripts.');
            }
        }
        // @ts-ignore
        ffmpeg = new self.FFmpeg.FFmpeg();
        // @ts-ignore
        ffmpeg.on('log', ({ type, message }) => {
            // console.log(`FFmpeg [${type}]: ${message}`); // Verbose for dev
            port.postMessage({ type: 'ffmpegLog', message: `[FFMPEG ${type}] ${message}`});
        });
        
        console.log(`[Background] Attempting to load FFmpeg core from: ${FFMPEG_CORE_URL}`)
        // @ts-ignore
        await ffmpeg.load({ coreURL: FFMPEG_CORE_URL });
        port.postMessage({ type: 'ffmpegStatus', status: 'FFmpeg loaded successfully.' });
        console.log('[Background] FFmpeg loaded successfully.');
        return ffmpeg;
    } catch (error) {
        console.error('[Background] Failed to load FFmpeg:', error);
        port.postMessage({ type: 'ffmpegStatus', status: `Failed to load FFmpeg: ${error.message}`, error: true });
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
async function optimizeImageWithFFmpegInBackground(inputFile, port) {
    if (!ffmpeg || !ffmpeg.loaded) {
        port.postMessage({ type: 'error', message: 'FFmpeg not available for image optimization.' });
        // Attempt to load FFmpeg if not available
        const ffmpegInstance = await loadFFmpeg(port);
        if (!ffmpegInstance) {
            port.postMessage({ type: 'error', message: 'FFmpeg could not be loaded. Cannot optimize image.', originalFileName: inputFile.name });
            return null;
        }
    }
    port.postMessage({ type: 'progress', message: `Optimizing large image ${inputFile.name}...` });
    console.log('[Background] Optimizing image:', inputFile.name);

    try {
        const inputFileName = `input_${Date.now()}_${inputFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const outputFileName = `optimized_${Date.now()}_${(inputFile.name.split('.')[0] || inputFile.name).replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;

        // @ts-ignore FFmpeg methods might not be fully typed if loaded dynamically
        await ffmpeg.writeFile(inputFileName, new Uint8Array(await inputFile.arrayBuffer()));
        
        console.log('[Background] Executing FFmpeg for image optimization...');
        // @ts-ignore
        await ffmpeg.exec([
            '-i', inputFileName,
            '-vf', 'scale=w=min(2048\\,iw):h=min(2048\\,ih):force_original_aspect_ratio=decrease', // Scale down to 2048px max, keeping aspect ratio
            '-q:v', '3', // Quality level (1-5, lower is better for some codecs, 2-5 typical for -q:v)
            outputFileName
        ]);

        // @ts-ignore
        const data = await ffmpeg.readFile(outputFileName);
        // @ts-ignore
        await ffmpeg.deleteFile(inputFileName);
        // @ts-ignore
        await ffmpeg.deleteFile(outputFileName);

        const optimizedBlob = new Blob([data.buffer], { type: 'image/jpeg' });
        const optimizedFile = new File([optimizedBlob], outputFileName, { type: 'image/jpeg' });

        if (optimizedFile.size > SINGLE_FILE_DIRECT_LIMIT) {
            port.postMessage({ type: 'warning', message: `Optimized image (${(optimizedFile.size / (1024*1024)).toFixed(1)}MB) is still larger than direct limit.` });
        }
        port.postMessage({ type: 'progress', message: `Image ${inputFile.name} optimized to ${(optimizedFile.size / (1024*1024)).toFixed(1)}MB.` });
        console.log('[Background] Image optimized:', optimizedFile.name, optimizedFile.size);
        return optimizedFile;

    } catch (error) {
        console.error('[Background] Error optimizing image with FFmpeg:', error);
        port.postMessage({ type: 'error', message: `Error optimizing ${inputFile.name}: ${error.message}` });
        return null; // Return null if optimization fails
    }
}

async function chunkFileWithFFmpegInBackground(inputFile, port) {
    if (!ffmpeg || !ffmpeg.loaded) {
        port.postMessage({ type: 'error', message: 'FFmpeg not available for chunking.' });
        const ffmpegInstance = await loadFFmpeg(port);
        if (!ffmpegInstance) {
            port.postMessage({ type: 'error', message: 'FFmpeg could not be loaded. Cannot chunk file.', originalFileName: inputFile.name });
            return null;
        }
    }
    port.postMessage({ type: 'progress', message: `Preparing to chunk ${inputFile.name}...` });
    console.log('[Background] Chunking file:', inputFile.name, inputFile.size, inputFile.type);

    const chunks = [];
    // Sanitize file names for FFmpeg
    const safeInputBaseName = inputFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const inputFileName = `input_${Date.now()}_${safeInputBaseName}`;
    const baseOutputName = `chunk_${Date.now()}_${(safeInputBaseName.split('.')[0] || safeInputBaseName)}`;
    const fileExtension = safeInputBaseName.includes('.') ? safeInputBaseName.substring(safeInputBaseName.lastIndexOf('.')) : (inputFile.type.startsWith('video/') ? '.mp4' : '.gif');

    let ffmpegLogOutput = "";
    const tempLogListener = ({ type, message }) => { 
        if(type === 'ffout' || type === 'fferr') ffmpegLogOutput += message + "\n"; 
    };
    // @ts-ignore
    ffmpeg.on('log', tempLogListener); // Add specific listener for duration parsing

    try {
        // @ts-ignore
        await ffmpeg.writeFile(inputFileName, new Uint8Array(await inputFile.arrayBuffer()));
        console.log(`[Background] Wrote ${inputFileName} to FFmpeg FS.`);

        let durationSeconds = 0;
        ffmpegLogOutput = ""; // Clear before exec for duration
        console.log('[Background] Executing FFmpeg to get duration...');
        try {
            // @ts-ignore
            await ffmpeg.exec(['-i', inputFileName, '-f', 'null', '-']); 
        } catch (e) { 
            // This command is expected to "fail" or complete with error code if -f null is used.
            // We are interested in the log output for duration.
            console.log('[Background] FFmpeg duration check exec finished (expected error/completion).');
        }
        
        const durationMatch = ffmpegLogOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
        if (durationMatch) {
            durationSeconds = parseInt(durationMatch[1])*3600 + parseInt(durationMatch[2])*60 + parseInt(durationMatch[3]) + parseFloat("0." + durationMatch[4]);
            console.log(`[Background] Parsed duration: ${durationSeconds}s`);
        } else {
            console.warn('[Background] Could not parse media duration from ffmpeg output for chunking.');
            port.postMessage({ type: 'warning', message: 'Could not determine media duration accurately for chunking. Will attempt basic split.'});
        }

        if (durationSeconds > 0 && inputFile.type.startsWith('video/')) { 
            // Video chunking logic based on duration
            const avgBitrate = (inputFile.size * 8) / durationSeconds;
            let segmentDuration = Math.floor((SINGLE_FILE_DIRECT_LIMIT * 0.85 * 8) / avgBitrate); // Target 85% of limit for safety
            segmentDuration = Math.max(10, Math.min(segmentDuration, 300)); // Clamp between 10s and 5min segments
            console.log(`[Background] Calculated segmentDuration: ${segmentDuration}s`);

            let startTime = 0;
            for (let i = 0; startTime < durationSeconds; i++) {
                if (chunks.length >= MAX_CHUNKS) {
                    port.postMessage({ type: 'warning', message: `Reached maximum chunk limit (${MAX_CHUNKS}). Stopping segmentation.` });
                    console.warn(`[Background] Max chunks (${MAX_CHUNKS}) reached.`);
                    break;
                }
                const chunkOutputName = `${baseOutputName}_part${i + 1}${fileExtension}`;
                let currentSegmentDuration = Math.min(segmentDuration, durationSeconds - startTime);
                if (currentSegmentDuration < 1 && (durationSeconds - startTime) > 0.1) currentSegmentDuration = durationSeconds - startTime; 
                if (currentSegmentDuration <= 0.1 && i > 0) break; 

                port.postMessage({ type: 'progress', message: `Preparing chunk ${i + 1}/${Math.ceil(durationSeconds/segmentDuration)}: from ${startTime.toFixed(1)}s for ${currentSegmentDuration.toFixed(1)}s` });
                console.log(`[Background] Chunk ${i+1}: ss=${startTime} t=${currentSegmentDuration} out=${chunkOutputName}`);
                // @ts-ignore
                await ffmpeg.exec([
                    '-ss', '' + startTime,
                    '-i', inputFileName,
                    '-t', '' + currentSegmentDuration,
                    '-c', 'copy', 
                    '-avoid_negative_ts', 'make_zero', // Or 'auto' / 'disabled' depending on ffmpeg version and needs
                    chunkOutputName
                ]);
                // @ts-ignore
                let data = await ffmpeg.readFile(chunkOutputName);
                let chunkFile = new File([data.buffer], chunkOutputName, { type: inputFile.type });

                if (chunkFile.size > SINGLE_FILE_DIRECT_LIMIT) { 
                     port.postMessage({ type: 'progress', message: `Chunk ${i+1} [copy] too large (${(chunkFile.size/(1024*1024)).toFixed(1)}MB), re-encoding...` });
                    console.log(`[Background] Chunk ${i+1} by copy was too large: ${chunkFile.size}. Re-encoding.`);
                    // @ts-ignore
                    await ffmpeg.deleteFile(chunkOutputName); // Delete oversized copied chunk
                    // @ts-ignore
                    await ffmpeg.exec([
                        '-ss', '' + startTime,
                        '-i', inputFileName,
                        '-t', '' + currentSegmentDuration,
                        '-fs', '' + SINGLE_FILE_DIRECT_LIMIT, // Target size limit for re-encode
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                        '-c:a', 'aac', '-b:a', '96k',
                        '-avoid_negative_ts', 'make_zero',
                        chunkOutputName
                    ]);
                    // @ts-ignore
                    data = await ffmpeg.readFile(chunkOutputName);
                    chunkFile = new File([data.buffer], chunkOutputName, { type: inputFile.type }); // Should be video/mp4 or similar after x264
                     if (chunkFile.size > SINGLE_FILE_DIRECT_LIMIT * 1.05) { // Check again, 5% tolerance
                        console.warn(`[Background] Re-encoded chunk ${i+1} still too large: ${chunkFile.size}. Skipping.`);
                        port.postMessage({ type: 'warning', message: `Re-encoded chunk ${i+1} still too large (${(chunkFile.size/(1024*1024)).toFixed(1)}MB). It will be skipped.`});
                        // @ts-ignore
                        await ffmpeg.deleteFile(chunkOutputName);
                        startTime += currentSegmentDuration;
                        continue; // Skip this problematic chunk
                     }
                }
                
                chunks.push(chunkFile);
                console.log(`[Background] Created chunk: ${chunkFile.name}, size: ${chunkFile.size}`);
                // @ts-ignore
                await ffmpeg.deleteFile(chunkOutputName);
                startTime += currentSegmentDuration;
            }
        } else { // For GIFs, or videos where duration couldn't be determined / very short videos
            port.postMessage({ type: 'progress', message: 'Attempting single chunk size-based split for non-video or short media...' });
            console.log('[Background] Attempting single chunk size-based split.');
            const chunkOutputName = `${baseOutputName}_part1${fileExtension}`;
            try {
                 // @ts-ignore
                await ffmpeg.exec([
                    '-i', inputFileName,
                    '-fs', '' + SINGLE_FILE_DIRECT_LIMIT, 
                    '-c', 'copy', 
                    chunkOutputName
                ]);
                // @ts-ignore
                const data = await ffmpeg.readFile(chunkOutputName);
                const singleChunk = new File([data.buffer], chunkOutputName, { type: inputFile.type });
                if (singleChunk.size > 0) {
                    chunks.push(singleChunk);
                    console.log(`[Background] Created single chunk by size: ${singleChunk.name}, size: ${singleChunk.size}`);
                }
                // @ts-ignore
                await ffmpeg.deleteFile(chunkOutputName);
            } catch (e) {
                console.error('[Background] Size-based split attempt failed:', e);
                port.postMessage({ type: 'warning', message: `Size-based split failed. Trying to use original file if small enough. Error: ${e.message.substring(0,100)}` });
                // If this fails, the original file might be used later if it's small enough, or process will fail
            }
        }

        // @ts-ignore
        await ffmpeg.deleteFile(inputFileName);
        console.log(`[Background] Deleted ${inputFileName} from FFmpeg FS.`);

    } catch (error) {
        console.error('[Background] Error during chunking file with FFmpeg:', error);
        port.postMessage({ type: 'error', message: `Error chunking file ${inputFile.name}: ${error.message}` });
        // Ensure input file is deleted from ffmpeg FS on error too
        try { // @ts-ignore
            await ffmpeg.deleteFile(inputFileName); 
        } catch (delError) { /* ignore */ }
        return null; // Critical error in chunking
    } finally {
        // @ts-ignore
        ffmpeg.off('log', tempLogListener); // Clean up specific log listener
    }

    if (chunks.length === 0 && inputFile.size > SINGLE_FILE_DIRECT_LIMIT) {
        // If chunking was attempted (file was large) but produced no chunks (e.g. all segments failed or were skipped)
        port.postMessage({ type: 'error', message: `No processable chunks were created from ${inputFile.name}. It might be too complex or an unrecoverable issue occurred.` });
        console.error(`[Background] Failed to create any chunks for large file: ${inputFile.name}`);
        return null;
    } else if (chunks.length === 0 && inputFile.size <= SINGLE_FILE_DIRECT_LIMIT) {
        // File was small, no chunks needed, and size-based split (if attempted) yielded nothing (should not happen often)
        // Fallback to using the original file if it was small enough
        console.log('[Background] No chunks created (file was small or split yielded nothing), using original file as the only "chunk".');
        return [inputFile];
    }

    port.postMessage({ type: 'progress', message: `File ${inputFile.name} prepared into ${chunks.length} part(s).` });
    console.log(`[Background] Chunking complete. Produced ${chunks.length} chunks for ${inputFile.name}.`);
    return chunks;
}

async function processSingleFileOrChunk(fileOrChunk, generationType, originalFile, port, chunkMetadata = {}) {
    // originalFile (the complete, initial file object) is passed for its properties like originalFile.type and originalFile.name
    // fileOrChunk is the actual data blob being processed (could be the originalFile or a chunk of it)
    
    port.postMessage({ type: 'progress', message: `Processing ${fileOrChunk.name} for ${generationType}...` });
    console.log('[Background] Starting processSingleFileOrChunk:', { name: fileOrChunk.name, type: fileOrChunk.type, size: fileOrChunk.size, generationType });

    try {
        const base64 = await fileToBase64(fileOrChunk);
        if (!base64) {
            throw new Error('Failed to convert file to base64.');
        }

        let requestPayload = {
            base64Data: base64,
            mimeType: fileOrChunk.type, 
            fileName: originalFile.name, 
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
            // Determine isVideo based on the original file type primarily, then current chunk type
            const isOriginalVideo = originalFile.type.startsWith('video/') || 
                                    ['image/gif', 'image/webp', 'image/apng'].includes(originalFile.type);
            
            requestPayload.isVideo = isOriginalVideo || 
                                   fileOrChunk.type.startsWith('video/') || 
                                   ['image/gif', 'image/webp', 'image/apng'].includes(fileOrChunk.type);
            
            if (requestPayload.isVideo && chunkMetadata.videoMetadata) {
                 if (chunkMetadata.videoMetadata.duration) requestPayload.videoDuration = chunkMetadata.videoMetadata.duration;
                 if (chunkMetadata.videoMetadata.width) requestPayload.videoWidth = chunkMetadata.videoMetadata.width;
                 if (chunkMetadata.videoMetadata.height) requestPayload.videoHeight = chunkMetadata.videoMetadata.height;
            }
        }
        
        console.log(`[Background] Sending to Cloud Function (${CLOUD_FUNCTION_URL}). Payload for ${generationType}:`, 
            { ...requestPayload, base64Data: `(data length: ${requestPayload.base64Data.length})` }
        );

        const response = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error('[Background] Cloud Function Error:', { status: response.status, data: responseData });
            const errorMsg = responseData.error || `Cloud Function failed with status ${response.status}`;
            port.postMessage({ type: 'error', message: `API Error: ${errorMsg}`, originalFileName: originalFile.name });
            return { error: errorMsg, originalFileName: originalFile.name }; 
        }
        
        port.postMessage({ type: 'progress', message: `${fileOrChunk.name} processed by API.` });
        console.log('[Background] Received from Cloud Function:', responseData);
        return responseData; 

    } catch (error) {
        console.error(`[Background] Error in processSingleFileOrChunk for ${fileOrChunk.name}:`, error);
        port.postMessage({ type: 'error', message: `Processing error for ${fileOrChunk.name}: ${error.message}`, originalFileName: originalFile.name });
        return { error: error.message, originalFileName: originalFile.name }; 
    }
}
// --- End Placeholder Functions ---

async function handleProcessLargeMedia(payload, port) {
    const { file: originalFileFromPayload, generationType, videoMetadata } = payload;
    // Use originalFileFromPayload consistently for the original file's properties
    const originalFile = originalFileFromPayload; 

    console.log('[Background] Received processLargeMedia:', { name: originalFile.name, type: originalFile.type, size: originalFile.size, generationType });

    if (!ffmpeg || !ffmpeg.loaded) {
        port.postMessage({ type: 'progress', message: 'Loading FFmpeg for processing...' });
        const ffmpegInstance = await loadFFmpeg(port);
        if (!ffmpegInstance) {
            port.postMessage({ type: 'error', message: 'FFmpeg could not be loaded. Cannot process media.', originalFileName: originalFile.name });
            return;
        }
    }

    let filesToProcess = [originalFile];
    let isSingleOptimizedImage = false;

    if (originalFile.size > SINGLE_FILE_DIRECT_LIMIT) {
        if (generationType === 'altText' && originalFile.type.startsWith('image/') && !['image/gif', 'image/webp', 'image/apng'].includes(originalFile.type)) {
            port.postMessage({ type: 'progress', message: `Large image detected. Attempting optimization (stub)...` });
            const optimizedFile = await optimizeImageWithFFmpegInBackground(originalFile, port);
            if (optimizedFile && optimizedFile.size <= SINGLE_FILE_DIRECT_LIMIT) {
                filesToProcess = [optimizedFile];
                isSingleOptimizedImage = true;
            } else if (optimizedFile) {
                filesToProcess = [optimizedFile]; // Still use it even if large
            }
        } 
        
        if (!isSingleOptimizedImage && (originalFile.type.startsWith('video/') || ['image/gif', 'image/webp', 'image/apng'].includes(originalFile.type))){
            port.postMessage({ type: 'progress', message: `Media is large. Attempting to chunk (stub)...` });
            const chunks = await chunkFileWithFFmpegInBackground(originalFile, port);
            if (chunks && chunks.length > 0) {
                filesToProcess = chunks;
            }
        }
    } 

    const results = [];
    for (let i = 0; i < filesToProcess.length; i++) {
        const chunk = filesToProcess[i];
        const chunkMeta = {
            isChunk: filesToProcess.length > 1,
            chunkIndex: i + 1,
            totalChunks: filesToProcess.length,
            videoMetadata: (originalFile.type.startsWith('video/')) ? videoMetadata : null
        };
        if (generationType === 'captions' && originalFile.type.startsWith('video/')) {
             chunkMeta.videoMetadata = videoMetadata; // Ensure duration is passed for captions
        }

        const result = await processSingleFileOrChunk(chunk, generationType, originalFile, port, chunkMeta);
        if (result && !result.error) {
            results.push(result);
        } else if (result && result.error) {
            port.postMessage({ type: 'error', message: result.error, originalFileName: originalFile.name });
            return; 
        }
    }

    if (results.length > 0) {
        if (generationType === 'altText') {
            const combinedAltText = results.map(r => r.altText).join(' ').trim();
            port.postMessage({ type: 'altTextResult', altText: combinedAltText, originalFileName: originalFile.name });
        } else if (generationType === 'captions') {
            const vttResults = results.map((r, index) => ({
                fileName: `${originalFile.name}_part${results.length > 1 ? (index+1) : ''}.vtt`.replace(/_part_part/g, '_part').replace(/\.vtt_part/g, '_part').replace(/_part\./g, '.'), // Cleaner name for single parts
                vttContent: r.vttContent
            }));
            port.postMessage({ type: 'captionResult', vttResults: vttResults, originalFileName: originalFile.name });
        }
    } else if (filesToProcess.length > 0) { // Processed files but got no results
        port.postMessage({ type: 'warning', message: 'Processing complete, but no results were generated.', originalFileName: originalFile.name });
    }
}

// WXT: export main for service worker environments that need it.
export default {
  main() {
    console.log('[Background] Service worker main() executed. Setting up listeners...');
    
    // ADD the listener here, inside main()
    browser.runtime.onConnect.addListener((port) => {
        if (port.name === 'content-script-port') {
            contentScriptPort = port;
            console.log('[Background] Content script connected.');

            // Non-blocking initial FFmpeg load attempt.
            loadFFmpeg(port).catch(err => console.warn("[Background] Initial FFmpeg load failed on connect:", err));

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
                // Consider FFmpeg cleanup if desired: ffmpeg.exit(); ffmpeg = null;
            });
        }
    });
    console.log('[Background] onConnect listener attached.');
  },
};

console.log('[Background] Background script loaded (listeners will be set up in main when service worker executes).');
