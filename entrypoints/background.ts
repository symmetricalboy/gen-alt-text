import browser from 'webextension-polyfill';

// Assuming ffmpeg.js UMD is loaded globally or via importScripts.
// The actual ffmpeg.js and ffmpeg-core.js/wasm should be in /public/assets/ffmpeg/

// const FFMPEG_SCRIPT_URL = browser.runtime.getURL('assets/ffmpeg/ffmpeg.js'); // Removed
// const FFMPEG_CORE_URL = browser.runtime.getURL('assets/ffmpeg/ffmpeg-core.js'); // Removed
// let ffmpeg = null; // Removed

const CLOUD_FUNCTION_URL = 'https://us-central1-symm-gemini.cloudfunctions.net/generateAltTextProxy';
const SINGLE_FILE_DIRECT_LIMIT = 19 * 1024 * 1024; // 19MB
const MAX_CHUNKS = 15; // Safety limit for chunks, already defined in my mental model for the previous full script.

let contentScriptPort: browser.Runtime.Port | null = null;

// --- Type definitions for FFmpeg operations and messages ---

// Base for all successful FFmpeg operations
interface FFmpegSuccessResultBase {
    success: true;
    fileName: string;
}

// Specific result type for operations returning file data
interface FFmpegDataResult extends FFmpegSuccessResultBase {
    data: ArrayBuffer;
    duration?: never;
    deleted?: never;
}

// Specific result type for operations returning media duration
interface FFmpegDurationResult extends FFmpegSuccessResultBase {
    duration: number;
    data?: never;
    deleted?: never;
}

// Specific result type for file deletion operations
interface FFmpegDeleteResult extends FFmpegSuccessResultBase {
    deleted: true;
    data?: never;
    duration?: never;
}

// Discriminated union for all possible successful outcomes of an FFmpeg operation
// This is what the `resolve` function in `ffmpegOperations` will expect,
// and what functions like `runFFmpegInOffscreen` will promise on success.
type FFmpegResolvedOperationOutput = FFmpegDataResult | FFmpegDurationResult | FFmpegDeleteResult;

// --- Other type definitions ---

interface OriginalFilePayload {
    name: string;
    type: string;
    size: number;
    arrayBuffer: ArrayBuffer;
}

interface ChunkMetadata {
    isChunk: boolean;
    chunkIndex: number;
    totalChunks: number;
    videoMetadata?: { 
        duration?: number;
        width?: number;
        height?: number;
    } | null; 
}

interface RequestPayload {
    base64Data: string;
    mimeType: string;
    fileName: string;
    fileSize: number;
    isChunk: boolean;
    chunkIndex: number;
    totalChunks: number;
    action?: 'generateCaptions'; 
    duration?: number;          
    isVideo?: boolean;          
    videoDuration?: number;     
    videoWidth?: number;        
    videoHeight?: number;       
}

interface ProcessLargeMediaPayload {
    name: string;
    type: string;
    size: number;
    base64Data: string;
    generationType: 'altText' | 'captions';
    videoMetadata?: { 
        duration?: number;
        width?: number;
        height?: number;
    } | null;
}

// --- Offscreen Document Logic ---
const OFFSCRREN_DOCUMENT_PATH = 'offscreen.html'; 

const ffmpegOperations = new Map<number, { resolve: (value: FFmpegResolvedOperationOutput) => void, reject: (reason?: any) => void }>();
let operationIdCounter = 0;

async function hasOffscreenDocument(): Promise<boolean> {
    if (chrome.offscreen && chrome.offscreen.hasDocument) {
        const existing = await chrome.offscreen.hasDocument();
        if (existing) console.log('[Background] Offscreen document exists.');
        else console.log('[Background] No offscreen document found.');
        return existing;
    }
    console.log('[Background] chrome.offscreen.hasDocument not available, using getContexts fallback.');
    const contexts: chrome.runtime.ExtensionContext[] | undefined = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [browser.runtime.getURL(OFFSCRREN_DOCUMENT_PATH)]
    });
    return contexts ? contexts.length > 0 : false;
}

async function setupOffscreenDocument(): Promise<boolean> {
    const docExists = await hasOffscreenDocument();
    if (!docExists) {
        console.log('[Background] Creating offscreen document...');
        await chrome.offscreen.createDocument({
            url: OFFSCRREN_DOCUMENT_PATH,
            reasons: [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.USER_MEDIA],
            justification: 'FFmpeg processing for media files.',
        });
        console.log('[Background] Offscreen document requested for creation.');
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Timeout waiting for offscreen FFmpeg to load.'));
                chrome.runtime.onMessage.removeListener(initialLoadListener);
            }, 60000);

            const initialLoadListener = (message: any, sender: chrome.runtime.MessageSender) => {
                if (message.type === 'ffmpegStatusOffscreen' && sender.url && sender.url.endsWith(OFFSCRREN_DOCUMENT_PATH)) {
                    clearTimeout(timeoutId);
                    chrome.runtime.onMessage.removeListener(initialLoadListener);
                    if (message.payload && message.payload.status === 'FFmpeg loaded in offscreen.') {
                        console.log('[Background] Received confirmation: FFmpeg loaded in offscreen document.');
                        resolve(true);
                    } else {
                        const errorMsg = message.payload?.error || 'Offscreen FFmpeg load failed.';
                        console.error('[Background] Offscreen document reported FFmpeg load failure:', errorMsg);
                        reject(new Error(String(errorMsg)));
                    }
                }
            };
            chrome.runtime.onMessage.addListener(initialLoadListener);
            console.log('[Background] Sending loadFFmpegOffscreen to offscreen document.');
            chrome.runtime.sendMessage({ target: 'offscreen-ffmpeg', type: 'loadFFmpegOffscreen' })
                .catch((err: Error) => {
                    clearTimeout(timeoutId);
                    chrome.runtime.onMessage.removeListener(initialLoadListener);
                    console.error('[Background] Error sending loadFFmpegOffscreen message:', err);
                    reject(new Error('Failed to send initial load message to offscreen document. It might not have loaded yet.'));
                });
        });
    } else {
        console.log('[Background] Offscreen document confirmed to already exist.');
        return true;
    }
}

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse) => {
    if (sender.url && sender.url.endsWith(OFFSCRREN_DOCUMENT_PATH)) {
        if (message.type === 'ffmpegLogOffscreen') {
            const { type, message: logMessage } = message.payload;
            if (contentScriptPort) {
                contentScriptPort.postMessage({ type: 'ffmpegLog', message: '[FFMPEG Offscreen ' + type + '] ' + logMessage });
            }
        } else if (message.type === 'ffmpegResultOffscreen') {
            console.log('[Background] Received ffmpegResultOffscreen:', message.payload);
            const { operationId, success, data, duration, deleted, error, fileName } = message.payload;
            if (ffmpegOperations.has(operationId)) {
                const operation = ffmpegOperations.get(operationId)!;
                if (success) {
                    let resultPayload: FFmpegResolvedOperationOutput;
                    if (typeof duration === 'number') {
                        resultPayload = { success: true, fileName, duration };
                    } else if (data instanceof ArrayBuffer || (typeof data === 'object' && data && typeof data.byteLength === 'number')) { // Check for ArrayBuffer-like
                        resultPayload = { success: true, fileName, data: data as ArrayBuffer };
                    } else if (deleted === true) {
                        resultPayload = { success: true, fileName, deleted };
                    } else {
                        operation.reject(new Error('Unknown successful FFmpeg result structure from offscreen.'));
                        ffmpegOperations.delete(operationId);
                        return true; // Indicate async response handled by reject
                    }
                    operation.resolve(resultPayload);
                } else {
                    operation.reject(new Error(error || 'Unknown FFmpeg offscreen error.'));
                }
                ffmpegOperations.delete(operationId);
            } else {
                console.warn("[Background] Unknown operationId received for ffmpegResultOffscreen.");
            }
        }
        else if (message.type === 'ffmpegStatusOffscreen' && message.payload && message.payload.status === 'FFmpeg loaded in offscreen.') {
            console.log('[Background] General listener caught FFmpeg loaded confirmation from offscreen.');
        }
    }
    return true; // Keep message channel open for async responses
});

async function runFFmpegInOffscreen(command: string[], inputFile: { name: string; data?: ArrayBuffer }, outputFileName: string): Promise<FFmpegResolvedOperationOutput> {
    await setupOffscreenDocument();
    const id = operationIdCounter++;
    const arrayBuffer = inputFile.data instanceof ArrayBuffer ? inputFile.data : undefined;

    if (inputFile.data && !arrayBuffer) {
        console.error('[Background] runFFmpegInOffscreen: inputFile.data was provided but not a valid ArrayBuffer!', inputFile.data);
        throw new Error('Internal: inputFile.data must be an ArrayBuffer if provided for runFFmpegInOffscreen.');
    }

    const promise = new Promise<FFmpegResolvedOperationOutput>((resolve, reject) => {
        ffmpegOperations.set(id, { resolve, reject });
        chrome.runtime.sendMessage({
            target: 'offscreen-ffmpeg',
            type: 'runFFmpegOffscreen',
            payload: {
                operationId: id,
                command,
                inputFile: { name: inputFile.name, data: arrayBuffer },
                outputFileName,
            },
        }, response => {
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message || 'Unknown error sending runFFmpegOffscreen message';
                console.error(`[Background] Error sending runFFmpegOffscreen (opId ${id}):`, errorMsg);
                if (ffmpegOperations.has(id)) {
                    ffmpegOperations.get(id)!.reject(new Error(errorMsg));
                    ffmpegOperations.delete(id);
                }
                return;
            }
            if (response && !response.success) {
                const errorMsg = response.error || "Offscreen document failed to start FFmpeg operation.";
                console.error(`[Background] Offscreen document reported immediate error for opId ${id}:`, errorMsg);
                if (ffmpegOperations.has(id)) {
                    ffmpegOperations.get(id)!.reject(new Error(String(errorMsg)));
                    ffmpegOperations.delete(id);
                }
                return;
            }
        });
    });

    const timeoutPromise = new Promise<FFmpegResolvedOperationOutput>((_, reject) => {
        setTimeout(() => {
            if (ffmpegOperations.has(id)) {
                const operation = ffmpegOperations.get(id)!;
                operation.reject(new Error(`FFmpeg operation (opId ${id}) timed out for ${outputFileName}`));
                ffmpegOperations.delete(id);
            }
        }, 120000);
    });

    return Promise.race([promise, timeoutPromise]);
}

async function getMediaDurationViaFFmpeg(inputFilePayload: OriginalFilePayload, port: browser.Runtime.Port): Promise<number> {
    port.postMessage({ type: 'progress', message: `Checking media duration for ${inputFilePayload.name}...` });
    const tempInputName = `input_${Date.now()}_${inputFilePayload.name}`;
    try {
        const result = await runFFmpegInOffscreen(
            ['get_duration'],
            { name: tempInputName, data: inputFilePayload.arrayBuffer },
            `${tempInputName}_duration_check`
        );
        if (result.success && typeof result.duration === 'number') {
            if (result.duration > 0) {
                port.postMessage({ type: 'progress', message: `Duration found: ${result.duration.toFixed(2)}s for ${inputFilePayload.name}` });
            } else {
                port.postMessage({ type: 'progress', message: `Media ${inputFilePayload.name} has no significant duration or is a still image.` });
            }
            return result.duration;
        }
        port.postMessage({ type: 'warning', message: `Could not determine duration for ${inputFilePayload.name} via FFmpeg.` });
        return 0;
    } catch (error) {
        console.error(`[Background] Error getting media duration for ${inputFilePayload.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        port.postMessage({ type: 'error', message: `Failed to get duration for ${inputFilePayload.name}: ${errorMessage}` });
        try {
            await runFFmpegCommandOnExistingFile(['delete_input_only'], tempInputName, `${tempInputName}_cleanup`, port, true);
        } catch (cleanupError) {
            const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError || 'Unknown cleanup error');
            console.warn(`[Background] Failed to cleanup ${tempInputName} after duration check error:`, cleanupMessage);
        }
        return 0;
    }
}

async function runFFmpegCommandOnExistingFile(
    command: string[],
    existingInputFileNameOnFFmpegFS: string,
    outputFileName: string,
    port: browser.Runtime.Port,
    isDeleteOperation: boolean = false
): Promise<FFmpegResolvedOperationOutput> {
    if (!isDeleteOperation) {
        port.postMessage({ type: 'progress', message: `Executing FFmpeg command for ${outputFileName}...` });
    }
    return runFFmpegInOffscreen(
        command,
        { name: existingInputFileNameOnFFmpegFS }, // data is implicitly undefined here
        outputFileName
    );
}

async function deleteFileInOffscreen(fileNameOnFFmpegFS: string, port: browser.Runtime.Port): Promise<boolean> {
    port.postMessage({ type: 'progress', message: `Deleting ${fileNameOnFFmpegFS} from remote FFmpeg FS...` });
    try {
        const result = await runFFmpegInOffscreen(
            ['delete_file_please', fileNameOnFFmpegFS],
            { name: fileNameOnFFmpegFS },
            `${fileNameOnFFmpegFS}_delete_op`
        );
        if (result.success && result.deleted) {
            port.postMessage({ type: 'progress', message: `${fileNameOnFFmpegFS} deleted from FFmpeg FS.` });
            return true;
        }
        port.postMessage({ type: 'error', message: `Failed to confirm deletion of ${fileNameOnFFmpegFS} from FFmpeg FS. Result: ${JSON.stringify(result)}` });
        return false;
    } catch (error) {
        console.error(`[Background] Error deleting ${fileNameOnFFmpegFS} in offscreen:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        port.postMessage({ type: 'error', message: `Failed to delete ${fileNameOnFFmpegFS}: ${errorMessage}` });
        return false;
    }
}

async function fileToBase64(file: File): Promise<string> {
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
        reader.onerror = (event: ProgressEvent<FileReader>) => {
            const error = event.target?.error || new Error('FileReader error');
            reject(error);
        };
    });
}

async function optimizeImageWithFFmpegInBackground(originalFilePayload: OriginalFilePayload, port: browser.Runtime.Port): Promise<File | null> {
    port.postMessage({ type: 'progress', message: `Optimizing large image ${originalFilePayload.name} via Offscreen Document...` });
    const tempInputName = `input_${Date.now()}_${originalFilePayload.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const tempOutputName = `optimized_${Date.now()}_${(originalFilePayload.name.split('.')[0] || originalFilePayload.name).replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;

    try {
        const result = await runFFmpegInOffscreen(
            ['-i', tempInputName, '-vf', 'scale=w=min(2048\\,iw):h=min(2048\\,ih):force_original_aspect_ratio=decrease', '-q:v', '3', tempOutputName],
            { name: tempInputName, data: originalFilePayload.arrayBuffer },
            tempOutputName
        );

        if (result.success && result.data) {
            const optimizedBlob = new Blob([result.data], { type: 'image/jpeg' });
            const finalFileName = `optimized_${originalFilePayload.name.split('.')[0]}.jpg`;
            const optimizedFile = new File([optimizedBlob], finalFileName, { type: 'image/jpeg' });

            if (optimizedFile.size > SINGLE_FILE_DIRECT_LIMIT) {
                port.postMessage({ type: 'warning', message: `Optimized image (${(optimizedFile.size / (1024 * 1024)).toFixed(1)}MB) is still larger than direct limit.` });
            }
            port.postMessage({ type: 'progress', message: `Image ${originalFilePayload.name} optimized to ${(optimizedFile.size / (1024 * 1024)).toFixed(1)}MB.` });
            return optimizedFile;
        } else if (result.success && !result.data) {
            console.warn('[Background] optimizeImageWithFFmpegInBackground: FFmpeg reported success but no data returned for ', tempOutputName);
            throw new Error('FFmpeg offscreen optimization succeeded but returned no data.');
        } else {
            // This case implies !result.success, which should have been a rejection from runFFmpegInOffscreen
            // If runFFmpegInOffscreen resolves with !success (which it shouldn't per its design), this logic is problematic.
            // Assuming runFFmpegInOffscreen throws for non-success or resolves with a structure handled above.
            const errorInfo = 'error' in result ? (result as any).error : 'unknown optimization failure';
            throw new Error(String(errorInfo));
        }
    } catch (error) {
        console.error(`[Background] Error optimizing image ${originalFilePayload.name} with FFmpeg via offscreen:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown optimization error');
        port.postMessage({ type: 'error', message: `Error optimizing ${originalFilePayload.name} (offscreen): ${errorMessage}` });
        try { await deleteFileInOffscreen(tempInputName, port); } catch (e) {
            const cleanupMessage = e instanceof Error ? e.message : String(e || 'Unknown cleanup error');
            console.warn(`Cleanup failed for ${tempInputName}: ${cleanupMessage}`);
        }
        return null;
    }
}

async function chunkFileWithFFmpegInBackground(
    originalFilePayload: OriginalFilePayload,
    port: browser.Runtime.Port
): Promise<File[] | null> {
    port.postMessage({ type: 'progress', message: `Preparing to chunk ${originalFilePayload.name} via Offscreen Document...` });

    const chunks: File[] = [];
    const tempInputNameOnFFmpegFS = `input_${Date.now()}_${originalFilePayload.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const baseOutputNameForChunks = `chunk_${Date.now()}_${(originalFilePayload.name.split('.')[0] || originalFilePayload.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const originalFileExtension = originalFilePayload.name.includes('.') ?
        originalFilePayload.name.substring(originalFilePayload.name.lastIndexOf('.')) :
        (originalFilePayload.type.startsWith('video/') ? '.mp4' : '.gif');

    let durationSeconds = 0;
    try {
        durationSeconds = await getMediaDurationViaFFmpeg(
            {
                name: tempInputNameOnFFmpegFS,
                type: originalFilePayload.type,
                size: originalFilePayload.arrayBuffer.byteLength,
                arrayBuffer: originalFilePayload.arrayBuffer
            },
            port
        );

        const isEffectivelyVideoType = originalFilePayload.type.startsWith('video/') || originalFilePayload.type === 'image/gif';

        if (durationSeconds > 0 && isEffectivelyVideoType) {
            const avgBitrate = (originalFilePayload.size * 8) / durationSeconds;
            let segmentTargetDuration = Math.floor((SINGLE_FILE_DIRECT_LIMIT * 0.85 * 8) / avgBitrate);
            segmentTargetDuration = Math.max(10, Math.min(segmentTargetDuration, 300));
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
                let chunkData = chunkResult.data;
                let actualChunkFileName = chunkResult.fileName;
                let actualChunkType = originalFilePayload.type;

                if (chunkResult.success && chunkData && chunkData.byteLength > SINGLE_FILE_DIRECT_LIMIT * 1.05) {
                    port.postMessage({ type: 'progress', message: `Chunk ${i + 1} (copy) too large. Re-encoding ${originalFilePayload.name}...` });
                    const reEncodeOutputName = `${outputChunkFileBaseName}.mp4`;
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
                    const errorInfo = 'error' in chunkResult ? (chunkResult as any).error : 'Error creating chunk';
                    port.postMessage({ type: 'error', message: `Error creating chunk ${i + 1} for ${originalFilePayload.name}: ${String(errorInfo)}` });
                }
                startTime += currentSegmentActualDuration;
            }
        } else if (originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT) {
            port.postMessage({ type: 'progress', message: `Attempting single size-based chunk for ${originalFilePayload.name}...` });
            const singleChunkOutputName = `${baseOutputNameForChunks}_part1${originalFileExtension}`;
            const singleChunkCommand = [
                '-i', tempInputNameOnFFmpegFS,
                '-fs', '' + SINGLE_FILE_DIRECT_LIMIT,
                '-c', 'copy',
                singleChunkOutputName
            ];
            const result = await runFFmpegCommandOnExistingFile(singleChunkCommand, tempInputNameOnFFmpegFS, singleChunkOutputName, port);
            if (result.success && result.data && result.data.byteLength > 0) {
                const chunkFile = new File([result.data], result.fileName, { type: originalFilePayload.type });
                chunks.push(chunkFile);
                console.log(`[Background] Created single chunk for ${originalFilePayload.name}: ${chunkFile.name}`);
                if (chunkFile.size < originalFilePayload.size * 0.90 && originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT * 1.1) {
                    port.postMessage({ type: 'warning', message: `${originalFilePayload.name} was processed as a single part. Result might be partial if very large.` });
                }
            } else if (!result.success) {
                const errorInfo = 'error' in result ? (result as any).error : 'Failed to create single chunk';
                port.postMessage({ type: 'error', message: `Failed to create single chunk for ${originalFilePayload.name}: ${String(errorInfo)}` });
            }
        }

        await deleteFileInOffscreen(tempInputNameOnFFmpegFS, port);

    } catch (error) {
        console.error(`[Background] Error during chunking file ${originalFilePayload.name} with FFmpeg (offscreen):`, error);
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown chunking error');
        port.postMessage({ type: 'error', message: `Error chunking ${originalFilePayload.name}: ${errorMessage}` });
        try { await deleteFileInOffscreen(tempInputNameOnFFmpegFS, port); } catch (e) {
            const cleanupMessage = e instanceof Error ? e.message : String(e || 'Unknown cleanup error');
            console.warn(`Cleanup failed for ${tempInputNameOnFFmpegFS}: ${cleanupMessage}`);
        }
        return null;
    }

    if (chunks.length === 0 && originalFilePayload.size > SINGLE_FILE_DIRECT_LIMIT) {
        port.postMessage({ type: 'error', message: `No processable chunks were created from ${originalFilePayload.name}.` });
        return null;
    } else if (chunks.length === 0 && originalFilePayload.size <= SINGLE_FILE_DIRECT_LIMIT) {
        port.postMessage({ type: 'progress', message: `${originalFilePayload.name} is small, processing directly.` });
        return [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, { type: originalFilePayload.type })];
    }

    port.postMessage({ type: 'progress', message: `File ${originalFilePayload.name} prepared into ${chunks.length} part(s).` });
    return chunks;
}

async function processSingleFileOrChunk(
    fileOrChunk: File,
    generationType: 'altText' | 'captions',
    originalFilePayloadInput: OriginalFilePayload, // Renamed to avoid conflict
    port: browser.Runtime.Port,
    chunkMetadata: ChunkMetadata = { isChunk: false, chunkIndex: 0, totalChunks: 0, videoMetadata: null }
): Promise<any> { // Consider defining a specific API result type
    port.postMessage({ type: 'progress', message: 'Processing ' + fileOrChunk.name + ' for ' + generationType + '...' });
    console.log('[Background] Starting processSingleFileOrChunk:', { name: fileOrChunk.name, type: fileOrChunk.type, size: fileOrChunk.size, generationType });

    try {
        const base64 = await fileToBase64(fileOrChunk);
        if (!base64) {
            throw new Error('Failed to convert file to base64.');
        }

        const requestPayload: RequestPayload = {
            base64Data: base64,
            mimeType: fileOrChunk.type,
            fileName: originalFilePayloadInput.name,
            fileSize: fileOrChunk.size,
            isChunk: chunkMetadata.isChunk,
            chunkIndex: chunkMetadata.chunkIndex,
            totalChunks: chunkMetadata.totalChunks,
        };

        if (generationType === 'captions') {
            requestPayload.action = 'generateCaptions';
            if (chunkMetadata.videoMetadata && chunkMetadata.videoMetadata.duration) {
                requestPayload.duration = chunkMetadata.videoMetadata.duration;
            }
        } else { // altText
            const isOriginalVideo = originalFilePayloadInput.type.startsWith('video/') ||
                ['image/gif', 'image/webp', 'image/apng'].includes(originalFilePayloadInput.type);

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
            port.postMessage({ type: 'error', message: 'API Error: ' + errorMsg, originalFileName: originalFilePayloadInput.name });
            return { error: errorMsg, originalFileName: originalFilePayloadInput.name };
        }

        port.postMessage({ type: 'progress', message: fileOrChunk.name + ' processed by API.' });
        console.log('[Background] Received from Cloud Function:', responseData);
        return responseData;

    } catch (error) {
        console.error('[Background] Error in processSingleFileOrChunk for ' + fileOrChunk.name + ':', error);
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown processing error');
        port.postMessage({ type: 'error', message: 'Processing error for ' + fileOrChunk.name + ': ' + errorMessage, originalFileName: originalFilePayloadInput.name });
        return { error: errorMessage, originalFileName: originalFilePayloadInput.name };
    }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function handleProcessLargeMedia(payload: ProcessLargeMediaPayload, port: browser.Runtime.Port) {
    console.log('[Background] handleProcessLargeMedia received payload:', payload);

    const { name: originalNameFromPayload, type: originalTypeFromPayload, size: originalSizeFromPayload, base64Data, generationType, videoMetadata } = payload;

    let reconstructedArrayBuffer: ArrayBuffer;
    if (typeof base64Data === 'string') {
        try {
            reconstructedArrayBuffer = base64ToArrayBuffer(base64Data);
        } catch (e) {
            const errMessage = e instanceof Error ? e.message : String(e || 'Unknown decoding error');
            port.postMessage({ type: 'error', message: 'Internal error: Failed to decode file data. ' + errMessage, originalFileName: originalNameFromPayload || 'unknown' });
            return;
        }
    } else {
        port.postMessage({ type: 'error', message: 'Internal error: File data not received correctly.', originalFileName: originalNameFromPayload || 'unknown' });
        return;
    }

    const originalFilePayload: OriginalFilePayload = {
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
        const errorMessage = setupError instanceof Error ? setupError.message : String(setupError || 'Unknown setup error');
        port.postMessage({ type: 'error', message: 'FFmpeg setup error: ' + errorMessage, originalFileName: originalFilePayload.name });
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
                filesToProcess = [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, { type: originalFilePayload.type })];
                port.postMessage({ type: 'warning', message: `Image optimization failed for ${originalFilePayload.name}. Will attempt to process original.` });
            }
        } else {
            filesToProcess = [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, { type: originalFilePayload.type })];
        }

        const currentFileToConsiderForChunking = filesToProcess[0];
        const isChunkableType = currentFileToConsiderForChunking.type.startsWith('video/') ||
            ['image/gif', 'image/webp', 'image/apng'].includes(currentFileToConsiderForChunking.type);

        if (currentFileToConsiderForChunking.size > SINGLE_FILE_DIRECT_LIMIT && isChunkableType) {
            port.postMessage({ type: 'progress', message: `Media ${currentFileToConsiderForChunking.name} requires chunking...` });
            const payloadForChunking: OriginalFilePayload = {
                name: currentFileToConsiderForChunking.name,
                type: currentFileToConsiderForChunking.type,
                size: currentFileToConsiderForChunking.size,
                arrayBuffer: await currentFileToConsiderForChunking.arrayBuffer()
            };
            const chunks = await chunkFileWithFFmpegInBackground(payloadForChunking, port);
            if (chunks && chunks.length > 0) {
                filesToProcess = chunks;
            } else if (chunks === null) {
                port.postMessage({ type: 'error', message: `Failed to chunk media ${originalFilePayload.name}. Processing cannot continue.`, originalFileName: originalFilePayload.name });
                return;
            } else {
                port.postMessage({ type: 'progress', message: `Chunking not applied or yielded no parts for ${currentFileToConsiderForChunking.name}. Proceeding with it as a single file.` });
            }
        } else if (currentFileToConsiderForChunking.size > SINGLE_FILE_DIRECT_LIMIT && !isChunkableType) {
            port.postMessage({ type: 'warning', message: `Large file ${currentFileToConsiderForChunking.name} (${(currentFileToConsiderForChunking.size / (1024 * 1024)).toFixed(1)}MB) is not a chunkable type. Will be sent as is.` });
        }

    } else {
        filesToProcess = [new File([originalFilePayload.arrayBuffer], originalFilePayload.name, { type: originalFilePayload.type })];
    }

    if (!filesToProcess || filesToProcess.length === 0) {
        port.postMessage({ type: 'error', message: `No files to process for ${originalFilePayload.name}. Workflow error.`, originalFileName: originalFilePayload.name });
        return;
    }

    const results = [];
    for (let i = 0; i < filesToProcess.length; i++) {
        const fileOrChunkToProcess = filesToProcess[i];
        const chunkMeta: ChunkMetadata = {
            isChunk: filesToProcess.length > 1,
            chunkIndex: i + 1,
            totalChunks: filesToProcess.length,
            videoMetadata: (fileOrChunkToProcess.type.startsWith('video/') || originalFilePayload.type.startsWith('video/')) && payload.videoMetadata ? payload.videoMetadata : null
        };

        const result = await processSingleFileOrChunk(fileOrChunkToProcess, generationType, originalFilePayload, port, chunkMeta);
        if (result && !result.error) {
            results.push(result);
        } else if (result && result.error) {
            return;
        } else {
            port.postMessage({ type: 'error', message: 'Unknown error processing chunk ' + (fileOrChunkToProcess.name || 'unknown chunk'), originalFileName: originalFilePayload.name });
            return;
        }
    }

    if (results.length > 0) {
        if (generationType === 'altText') {
            const combinedAltText = results.map(r => r.altText).join(' ').trim();
            port.postMessage({ type: 'altTextResult', altText: combinedAltText, originalFileName: originalFilePayload.name });
        } else if (generationType === 'captions') {
            const vttResults = results.map((r, index) => ({
                fileName: (originalFilePayload.name || 'media') + '_part' + (results.length > 1 ? (index + 1) : '') + '.vtt'.replace(/_part_part/g, '_part').replace(/\\.vtt_part/g, '_part').replace(/_part\\./g, '.'),
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

        browser.runtime.onConnect.addListener((port: browser.Runtime.Port) => {
            if (port.name === 'content-script-port') {
                contentScriptPort = port;
                console.log('[Background] Content script connected.');

                setupOffscreenDocument().catch((err: Error) => {
                    console.warn("[Background] Initial Offscreen Document setup/FFmpeg load failed on connect:", err.message);
                    if (contentScriptPort) {
                        contentScriptPort.postMessage({ type: 'ffmpegStatus', status: 'FFmpeg initial setup error: ' + err.message, error: true });
                    }
                });

                port.onMessage.addListener(async (message: any) => { 
                    console.log('[Background] Received message from content script:', message.type, message.payload ? message.payload : '');
                    if (message.type === 'processLargeMedia' && message.payload) {
                        await handleProcessLargeMedia(message.payload as ProcessLargeMediaPayload, port);
                    } else if (message.type === 'ping') {
                        port.postMessage({ type: 'pong' });
                    }
                });

                port.onDisconnect.addListener(() => {
                    console.log('[Background] Content script disconnected.');
                    if (contentScriptPort === port) {
                        contentScriptPort = null;
                    }
                });
            }
        });
        console.log('[Background] onConnect listener attached.');
    },
};

console.log('[Background] Background script loaded (listeners will be set up in main when service worker executes).');
