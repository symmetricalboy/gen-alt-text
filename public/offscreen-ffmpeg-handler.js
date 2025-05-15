// public/offscreen-ffmpeg-handler.js
console.log('[Offscreen] Handler script loaded.');

let ffmpegInstance = null;
let FFMPEG_LOADED = false;
let loadInProgress = false;
let loadPromise = null;
const MAX_LOAD_ATTEMPTS = 2;
// Original relative path for constructing the full URL
const ffmpegCoreJsPathSuffix = '/assets/ffmpeg/ffmpeg-core.js';
const ffmpegCoreWasmPathSuffix = '/assets/ffmpeg/ffmpeg-core.wasm';
const ffmpegCoreWorkerPathSuffix = '/assets/ffmpeg/ffmpeg-core.worker.js'; // Added for explicitness

async function getFFmpegInstance() {
    if (ffmpegInstance && ffmpegInstance.loaded) {
        console.log('[Offscreen] Returning existing loaded FFmpeg instance.');
        return ffmpegInstance;
    }
    if (loadInProgress) {
        console.log('[Offscreen] FFmpeg load already in progress, awaiting completion...');
        return loadPromise;
    }

    loadInProgress = true;
    loadPromise = new Promise(async (resolve, reject) => {
        try {
            if (!self.FFmpeg || !self.FFmpeg.FFmpeg) {
                console.error('[Offscreen] self.FFmpeg or self.FFmpeg.FFmpeg is not available. Ensure ffmpeg.min.js is loaded and FFMPEG_MP is defined.');
                throw new Error('FFmpeg library not available.');
            }
            console.log('[Offscreen] Creating new FFmpeg instance...');
            const newInstance = new self.FFmpeg.FFmpeg();
            console.log('[Offscreen] FFmpeg instance created.');

            if (newInstance.setLogging) {
                console.log('[Offscreen] Enabling FFmpeg library verbose logging before load.');
                try {
                    newInstance.setLogging(true);
                } catch (e) {
                    console.warn('[Offscreen] Could not enable FFmpeg verbose logging:', e);
                }
            }

            newInstance.on('log', ({ type, message }) => {
                console.log(`[FFmpeg Log Offscreen - ${type}] ${message}`);
            });
            console.log('[Offscreen] Attached FFmpeg log listener.');

            const corePath = browser.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
            const wasmPath = browser.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm');
            const workerPath = browser.runtime.getURL('assets/ffmpeg/ffmpeg-core.worker.js');

            console.log('[Offscreen] FFmpeg core paths resolved:');
            console.log(`[Offscreen] Core JS URL: ${corePath}`);
            console.log(`[Offscreen] WASM URL: ${wasmPath}`);
            console.log(`[Offscreen] Worker URL: ${workerPath}`);

            console.log(`[Offscreen] PRE-LOAD: Attempting newInstance.load() now at ${new Date().toISOString()}`);
            await newInstance.load({
                coreURL: corePath,
                wasmURL: wasmPath,
                workerURL: workerPath,
            });
            console.log(`[Offscreen] POST-LOAD: newInstance.load() completed at ${new Date().toISOString()}`);
            
            console.log('[Offscreen] FFmpeg loaded successfully via explicit paths.');
            newInstance.loaded = true; // Custom flag
            ffmpegInstance = newInstance;
            resolve(ffmpegInstance);
        } catch (loadErr) {
            console.error(`[Offscreen] CATCH-LOAD-ERROR: FFmpeg load failed at ${new Date().toISOString()} with error:`, loadErr);
            ffmpegInstance = null; // Ensure it's null on failure
            reject(loadErr);
        } finally {
            loadInProgress = false;
        }
    });
    return loadPromise;
}

async function loadFFmpegOnce() {
    if (FFMPEG_LOADED || loadAttempts >= MAX_LOAD_ATTEMPTS) {
        if (FFMPEG_LOADED) console.log('[Offscreen] loadFFmpegOnce: Already loaded or max attempts reached (already loaded).');
        else console.warn('[Offscreen] loadFFmpegOnce: Max load attempts reached, FFmpeg not loaded.');
        return FFMPEG_LOADED;
    }
    loadAttempts++;
    console.log(`[Offscreen] Loading FFmpeg instance (attempt ${loadAttempts}/${MAX_LOAD_ATTEMPTS})...`);

    if (!self.FFmpeg) {
        console.error('[Offscreen] FFmpeg.js script not loaded on self/global! Cannot initialize.');
        return false;
    }
    if (!ffmpegInstance) {
        console.log('[Offscreen] new self.FFmpeg.FFmpeg() instance created.');
        ffmpegInstance = new self.FFmpeg.FFmpeg();
    }

    // Enable verbose logging for FFmpeg library
    if (ffmpegInstance && ffmpegInstance.setLogging) {
        console.log('[Offscreen] Enabling FFmpeg library verbose logging.');
        try {
            ffmpegInstance.setLogging(true);
        } catch (e) {
            console.warn('[Offscreen] Could not enable FFmpeg verbose logging:', e);
        }
    }

    ffmpegInstance.on('log', ({ type, message }) => {
        // console.log(`[Offscreen FFmpeg Log - ${type}] ${message}`); // More verbose local log
        chrome.runtime.sendMessage({ 
            type: 'ffmpegLogOffscreen', 
            payload: { type, message } 
        }).catch(e => console.warn('[Offscreen] Error sending log message:', e.message));
    });

    const resolvedCorePath = chrome.runtime.getURL(ffmpegCoreJsPathSuffix);
    const resolvedWasmPath = chrome.runtime.getURL(ffmpegCoreWasmPathSuffix);
    const resolvedWorkerPath = chrome.runtime.getURL(ffmpegCoreWorkerPathSuffix);

    console.log(`[Offscreen] Attempting to load FFmpeg with explicit paths:`);
    console.log(`[Offscreen] Core JS URL: ${resolvedCorePath}`);
    console.log(`[Offscreen] WASM URL: ${resolvedWasmPath}`);
    console.log(`[Offscreen] Worker URL: ${resolvedWorkerPath}`);

    try {
        await ffmpegInstance.load({
            coreURL: resolvedCorePath,
            wasmURL: resolvedWasmPath,    // Explicitly provide wasmURL
            workerURL: resolvedWorkerPath // Explicitly provide workerURL
        }); 
        console.log('[Offscreen] ffmpegInstance.load() promise resolved successfully.');
    } catch (loadError) {
        console.error('[Offscreen] Error caught directly from ffmpegInstance.load():', loadError);
        throw loadError; // Re-throw to be caught by the caller in onMessage
    }
    
    if (!ffmpegInstance.loaded) {
        console.warn('[Offscreen] ffmpegInstance.load() resolved, but instance.loaded is false. CHECK NETWORK TAB for WASM/Worker loading issues!');
    }

    console.log('[Offscreen] FFmpeg core presumed loaded. instance.loaded status: ', ffmpegInstance.loaded);
    return ffmpegInstance;
}

// Listener for messages from the Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] Message received in onMessage listener:', message);

    // Ensure messages are intended for the offscreen document and this specific handler
    if (message.target !== 'offscreen-ffmpeg') {
        console.log('[Offscreen] Message target \'' + message.target + '\' not for offscreen-ffmpeg, ignoring.');
        return false; // Not handling this message
    }

    console.log('[Offscreen] Processing message for target offscreen-ffmpeg:', message.type, message.payload?.operationId ? `opId: ${message.payload.operationId}`: '');

    if (message.type === 'loadFFmpegOffscreen') { // This message is still sent with target: 'offscreen' from background.ts setupOffscreenDocument
        console.log('[Offscreen] Processing loadFFmpegOffscreen message...');
        getFFmpegInstance()
            .then(() => {
                console.log('[Offscreen] FFmpeg load successful (from loadFFmpegOffscreen message).');
                // Send message back to background script
                chrome.runtime.sendMessage({ 
                    type: 'ffmpegStatusOffscreen', 
                    payload: { status: 'FFmpeg loaded in offscreen.' } 
                }).catch(e => console.warn('[Offscreen] Error sending ffmpegStatusOffscreen (success) message:', e.message));
            })
            .catch(error => {
                console.error('[Offscreen] FFmpeg load failed (from loadFFmpegOffscreen message):', error);
                // Send error message back to background script
                chrome.runtime.sendMessage({ 
                    type: 'ffmpegStatusOffscreen', 
                    payload: { status: 'FFmpeg load failed in offscreen.', error: error.message || 'Unknown FFmpeg load error' } 
                }).catch(e => console.warn('[Offscreen] Error sending ffmpegStatusOffscreen (error) message:', e.message));
            });
        return true; // Indicates async response
    }
    else if (message.type === 'runFFmpegOffscreen') { // Target 'offscreen-ffmpeg' already confirmed by the outer if
        const { operationId, command, inputFile, outputFileName } = message.payload;
        let ffmpeg;
        console.log(`[Offscreen] Processing runFFmpegOffscreen message for opId: ${operationId}`);

        getFFmpegInstance()
            .then(instance => {
                ffmpeg = instance;
                if (!ffmpeg || !ffmpeg.loaded) { // Check .loaded status here
                    console.error(`[Offscreen] FFmpeg not loaded for opId: ${operationId}. Loaded status: ${ffmpeg?.loaded}`);
                    throw new Error('FFmpeg is not loaded or ready for execution.');
                }
                if (inputFile && inputFile.data) { // Only write if data is provided
                    console.log(`[Offscreen] Writing file: ${inputFile.name} (size: ${inputFile.data.byteLength}) for opId: ${operationId}`);
                    return ffmpeg.writeFile(inputFile.name, new Uint8Array(inputFile.data));
                }
                console.log(`[Offscreen] inputFile.data not provided for opId: ${operationId}. Assuming file ${inputFile.name} already exists or command does not need it.`);
                return Promise.resolve(); // Resolve if no data to write
            })
            .then(() => {
                if (Array.isArray(command) && command.length === 1 && command[0] === 'get_duration') {
                    console.log(`[Offscreen] Special command: get_duration for opId: ${operationId} on file ${inputFile.name}`);
                    let durationLogs = '';
                    const durationLogCallback = ({ type, message }) => {
                        durationLogs += message + '\n';
                    };
                    // inputFile.name should be the name of the file already written to FFmpeg FS
                    return ffmpeg.exec(['-i', inputFile.name, '-f', 'null', '-'], undefined, { logCallback: durationLogCallback })
                        .catch(e => {
                            // This command is expected to 'fail' in terms of exit code but logs are still generated
                            console.log("[Offscreen] 'get_duration' exec finished (expected error/no output file):", e.message);
                        })
                        .then(() => {
                            // Parse durationLogs
                            const durationMatch = durationLogs.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
                            let durationSeconds = 0;
                            if (durationMatch) {
                                durationSeconds = parseInt(durationMatch[1])*3600 + parseInt(durationMatch[2])*60 + parseInt(durationMatch[3]) + parseFloat("0." + durationMatch[4]);
                                console.log(`[Offscreen] Parsed duration for opId ${operationId}: ${durationSeconds}s`);
                                return { duration: durationSeconds }; // Return duration in an object
                            } else {
                                console.warn(`[Offscreen] Could not parse duration from logs for opId ${operationId}:`, durationLogs.substring(0, 500));
                                return { duration: 0 }; // Return 0 if not found
                            }
                        });
                } else if (Array.isArray(command) && command.length === 2 && command[0] === 'delete_file_please') {
                    const fileToDelete = command[1];
                    console.log(`[Offscreen] Special command: delete_file_please for opId: ${operationId} on file ${fileToDelete}`);
                    return ffmpeg.deleteFile(fileToDelete)
                        .then(() => {
                            console.log(`[Offscreen] Successfully deleted ${fileToDelete} for opId ${operationId}`);
                            return { deleted: true, fileName: fileToDelete }; // Indicate success and what was deleted
                        })
                        .catch(e => {
                            console.error(`[Offscreen] Error deleting ${fileToDelete} for opId ${operationId}:`, e);
                            throw new Error(`Failed to delete ${fileToDelete} in offscreen: ${e.message}`);
                        });
                }
                console.log(`[Offscreen] Executing FFmpeg command for opId: ${operationId}:`, command);
                return ffmpeg.exec(command).then(() => null); // Ensure regular commands resolve to something, result handled by readFile
            })
            .then((execResult) => { // execResult will be {duration: ...}, {deleted:true}, or null
                if (execResult && typeof execResult.duration !== 'undefined') {
                    // This was a get_duration call
                    return { data: null, customData: execResult }; 
                } else if (execResult && execResult.deleted) {
                    // This was a delete_file_please call
                    return { data: null, customData: execResult };
                }
                // Regular command execution path
                console.log(`[Offscreen] Reading output file: ${outputFileName} for opId: ${operationId}`);
                return ffmpeg.readFile(outputFileName).then(data => ({ data })); // data wrapped to distinguish from duration path
            })
            .then((result) => { // result is {data: ArrayBuffer} or {data:null, customData:{duration: ...} or {deleted: ...}}
                if (result.customData && typeof result.customData.duration !== 'undefined') {
                    return result.customData; 
                } else if (result.customData && result.customData.deleted) {
                    return result.customData;
                }
                // Regular path: delete input and output files
                const outputData = result.data;
                console.log(`[Offscreen] Deleting input file: ${inputFile.name} for opId: ${operationId}`);
                return ffmpeg.deleteFile(inputFile.name).then(() => outputData);
            })
            .then(outputDataOrSpecialResult => { 
                if (typeof outputDataOrSpecialResult.duration !== 'undefined') {
                    console.log(`[Offscreen] Duration command successful for opId: ${operationId}. Sending result with duration.`);
                    chrome.runtime.sendMessage({
                        type: 'ffmpegResultOffscreen',
                        payload: { operationId, success: true, duration: outputDataOrSpecialResult.duration, fileName: inputFile.name }
                    }).catch(e => console.warn(`[Offscreen] Error sending duration success result for opId ${operationId}:`, e.message));
                } else if (outputDataOrSpecialResult.deleted) {
                    console.log(`[Offscreen] File deletion command successful for opId: ${operationId}. File: ${outputDataOrSpecialResult.fileName}`);
                    chrome.runtime.sendMessage({
                        type: 'ffmpegResultOffscreen',
                        payload: { operationId, success: true, deleted: true, fileName: outputDataOrSpecialResult.fileName }
                    }).catch(e => console.warn(`[Offscreen] Error sending delete success result for opId ${operationId}:`, e.message));
                } else {
                    console.log(`[Offscreen] FFmpeg command successful for opId: ${operationId}. Sending result.`);
                    chrome.runtime.sendMessage({
                        type: 'ffmpegResultOffscreen',
                        payload: { operationId, success: true, data: outputDataOrSpecialResult.buffer, fileName: outputFileName }
                    }).catch(e => console.warn(`[Offscreen] Error sending success result for opId ${operationId}:`, e.message));
                }
                sendResponse({ success: true });
            })
            .catch(e => {
                console.error(`[Offscreen] FFmpeg run error during chain for opId ${operationId}:`, e);
                chrome.runtime.sendMessage({
                    type: 'ffmpegResultOffscreen',
                    payload: { operationId, success: false, error: e.message, fileName: outputFileName }
                }).catch(e => console.warn(`[Offscreen] Error sending error result for opId ${operationId}:`, e.message));
                sendResponse({ success: false, error: e.message });
            });
        return true; // Indicates async response, important for keeping message channel open
    }
    return false; // Default for unhandled messages
});

console.log('[Offscreen] Event listeners set up.'); 