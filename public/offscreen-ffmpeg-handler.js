// public/offscreen-ffmpeg-handler.js
console.log('[Offscreen] Handler script loaded.');

const runtimeAPI = typeof browser !== 'undefined' ? browser : chrome;

let ffmpegInstance = null;
let FFMPEG_LOADED = false; // Tracks if newInstance.load() was successful
let loadInProgress = false;
let loadPromise = null;

// Check if we're running in a service worker context (not strictly necessary for offscreen, but good for context)
const isOffscreenDocument = typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.getURL;

// Add debugging functions
function checkFileExists(url) {
    return fetch(url, { method: 'HEAD' })
        .then(response => {
            if (response.ok) {
                console.log(`[Offscreen] File exists at URL: ${url}`);
                return true;
            } else {
                console.error(`[Offscreen] File NOT found at URL: ${url}. Status: ${response.status}`);
                return false;
            }
        })
        .catch(error => {
            console.error(`[Offscreen] Error checking file at URL: ${url}. Error: ${error.message}`);
            return false;
        });
}

// ensureFFmpegLibraryLoaded, loadFFmpegDirectly, and loadFFmpegOnce are removed as their 
// responsibilities are now handled by using self.FFmpeg.createFFmpeg() with a corePath.

async function getFFmpegInstance() {
    if (ffmpegInstance && FFMPEG_LOADED) { // Check our FFMPEG_LOADED flag
        console.log('[Offscreen] Returning existing successfully loaded FFmpeg instance.');
        return ffmpegInstance;
    }
    if (loadInProgress) {
        console.log('[Offscreen] FFmpeg load already in progress, awaiting completion...');
        return loadPromise;
    }

    loadInProgress = true;
    loadPromise = new Promise(async (resolve, reject) => {
        try {
            // For FFmpeg v0.12.6, we expect the main FFmpeg class to be available.
            // This might be on self.FFmpeg.FFmpeg or directly as FFmpeg depending on how v0.12.6's ffmpeg.min.js is structured.
            // Adjust this check if FFmpeg is exposed differently by your new v0.12.6 ffmpeg.min.js file.
            if (typeof self.FFmpegWASM === 'undefined' || typeof self.FFmpegWASM.FFmpeg !== 'function') {
                const errorMsg = 'self.FFmpegWASM.FFmpeg class is not available. ffmpeg.min.js (v0.12.6 wrapper) might have failed to load or initialize correctly.';
                console.error('[Offscreen]', errorMsg);
                throw new Error(errorMsg);
            }

            console.log('[Offscreen] Attempting to instantiate new self.FFmpegWASM.FFmpeg() for v0.12.6...');
            
            const newInstance = new self.FFmpegWASM.FFmpeg();

            // Setup log and progress handlers using the .on() method
            newInstance.on('log', ({ type, message }) => {
                console.log(`[FFmpeg Internal Log - ${type}] ${message}`);
                runtimeAPI.runtime.sendMessage({ 
                    type: 'ffmpegLogOffscreen', 
                    payload: { type: `core-${type}`, message } 
                }).catch(e => console.warn('[Offscreen] Error sending core log message:', e.message));
            });

            newInstance.on('progress', (progress) => { 
                const ratio = progress.ratio !== undefined ? progress.ratio : (progress.time && progress.duration ? progress.time / progress.duration : undefined);
                console.log('[Offscreen] FFmpeg Load/Exec Progress (v0.12.6):', progress);
                if (ratio !== undefined) {
                    runtimeAPI.runtime.sendMessage({ 
                        type: 'ffmpegStatusOffscreen', 
                        payload: { 
                            status: `FFmpeg progress: ${Math.round(ratio * 100)}%`, 
                            progress: 'loading-core-or-processing',
                            ratio: ratio,
                            timestamp: new Date().toISOString() 
                        }
                    }).catch(e => console.warn('[Offscreen] Error sending progress message:', e.message));
                }
            });

            // Send a progress message to the background script
            try {
                runtimeAPI.runtime.sendMessage({ 
                    type: 'ffmpegStatusOffscreen', 
                    payload: { status: 'FFmpeg instance created, calling load() with explicit paths (v0.12.6)', progress: 'start' }
                }).catch(e => console.warn('[Offscreen] Error sending FFmpeg load start message:', e.message));
            } catch (e) {
                console.warn('[Offscreen] Error sending FFmpeg load start message:', e);
            }
            
            console.log('[Offscreen] FFmpeg instance created. Now calling newInstance.load() with configuration.');

            const coreURL = runtimeAPI.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
            const wasmURL = runtimeAPI.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm');

            console.log(`[Offscreen] Resolved coreURL: ${coreURL}`);
            console.log(`[Offscreen] Resolved wasmURL: ${wasmURL}`);

            // Check if core files are fetchable
            try {
                const coreResponse = await fetch(coreURL, { method: 'HEAD' });
                if (!coreResponse.ok) {
                    throw new Error(`Failed to fetch ffmpeg-core.js: ${coreResponse.status} ${coreResponse.statusText}`);
                }
                console.log('[Offscreen] ffmpeg-core.js HEAD request successful.');

                const wasmResponse = await fetch(wasmURL, { method: 'HEAD' });
                if (!wasmResponse.ok) {
                    throw new Error(`Failed to fetch ffmpeg-core.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`);
                }
                console.log('[Offscreen] ffmpeg-core.wasm HEAD request successful.');
            } catch (fetchError) {
                console.error('[Offscreen] Error fetching core FFmpeg files:', fetchError);
                throw new Error(`Core FFmpeg file fetch error: ${fetchError.message}`);
            }

            const loadTimeoutDuration = 180000; // 3 minutes
            const loadTimeout = setTimeout(() => {
                console.error(`[Offscreen] FFmpeg newInstance.load() timed out after ${loadTimeoutDuration / 1000}s`);
                // Make sure to call reject on the outer promise
                loadInProgress = false; // Reset progress flag
                reject(new Error(`FFmpeg newInstance.load() timed out after ${loadTimeoutDuration / 1000}s`));
            }, loadTimeoutDuration);

            console.log('[Offscreen] About to call newInstance.load() with configuration:', {
                coreURL: coreURL,
                wasmURL: wasmURL,
                log: true
            });
            
            try {
                console.log('[Offscreen] Calling newInstance.load()...');
                await newInstance.load({
                    coreURL: coreURL, // Use the checked URL
                    wasmURL: wasmURL, // Use the checked URL
                    // workerURL: is omitted as per user confirmation no separate worker file for v0.12.6 found
                    log: true // Keep log: true to enable core logs, which .on('log',...) will pick up
                });
                console.log('[Offscreen] newInstance.load() returned successfully.');
            } catch (loadError) {
                console.error('[Offscreen] newInstance.load() threw an error:', loadError);
                clearTimeout(loadTimeout);
                throw loadError;
            }
            
            clearTimeout(loadTimeout);
            console.log('[Offscreen] newInstance.load() completed successfully.');

            // Verify with a -version call if possible, or a simple FS operation
            try {
                await newInstance.FS('writeFile', 'test.txt', 'hello');
                const data = await newInstance.FS('readFile', 'test.txt');
                await newInstance.FS('unlink', 'test.txt');
                if (new TextDecoder().decode(data) === 'hello') {
                    console.log('[Offscreen] FFmpeg instance FS check passed.');
                } else {
                     throw new Error('FS check failed to verify read/write.');
                }
            } catch (verifyError) {
                console.error('[Offscreen] FFmpeg instance verification (FS check) failed after load():', verifyError);
                throw new Error(`FFmpeg instance verification failed: ${verifyError.message}`);
            }

            ffmpegInstance = newInstance;
            FFMPEG_LOADED = true; // Set our flag
            resolve(ffmpegInstance);

        } catch (error) {
            console.error('[Offscreen] Error in getFFmpegInstance (during createFFmpeg or newInstance.load()):', error);
            ffmpegInstance = null; // Clear instance on error
            FFMPEG_LOADED = false;
            reject(error); // Propagate the error
        } finally {
            loadInProgress = false;
        }
    });
    return loadPromise;
}


// Listener for messages from the Service Worker
runtimeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] Message received in onMessage listener:', message);

    if (!message.target) {
        console.warn('[Offscreen] Received message with no target property. Ignoring. Message:', message);
        return false;
    }

    if (message.target !== 'offscreen-ffmpeg') {
        console.log('[Offscreen] Message target \'" + message.target + "\' not for offscreen-ffmpeg, ignoring.');
        return false;
    }

    console.log('[Offscreen] Processing message for target offscreen-ffmpeg:', message.type, message.payload?.operationId ? `opId: ${message.payload.operationId}`: '');

    if (message.type === 'loadFFmpegOffscreen') {       
        console.log('[Offscreen] Processing loadFFmpegOffscreen message...');
        
        // Check for WASM support (good to keep this check)
        if (typeof WebAssembly === 'undefined') {
            const errorMsg = 'WebAssembly is not supported in this browser';
            console.error('[Offscreen]', errorMsg);
            runtimeAPI.runtime.sendMessage({ 
                type: 'ffmpegStatusOffscreen', 
                payload: { status: `FFmpeg load failed: ${errorMsg}`, error: errorMsg, progress: 'error', timestamp: new Date().toISOString() }
            }).catch(e => console.warn('[Offscreen] Error sending WebAssembly error message:', e.message));
            // sendResponse({ success: false, error: errorMsg }); // Optional: sendResponse if expecting direct reply
            return true; // Indicate async handling if sendResponse might be called later, or if message fully handled.
        }
        // SharedArrayBuffer check can also remain if relevant for your FFmpeg build/usage
        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        if (!hasSharedArrayBuffer) {
            console.warn('[Offscreen] SharedArrayBuffer is not available - some FFmpeg operations may fail or run slower.');
        }
        
        getFFmpegInstance()
            .then(() => {
                console.log('[Offscreen] FFmpeg instance obtained successfully (from loadFFmpegOffscreen message).');
                runtimeAPI.runtime.sendMessage({ 
                    type: 'ffmpegStatusOffscreen', 
                    payload: { status: 'FFmpeg loaded and ready in offscreen document.', progress: 'complete', timestamp: new Date().toISOString() }
                }).catch(e => console.warn('[Offscreen] Error sending ffmpegStatusOffscreen (success) message:', e.message));
                // sendResponse({ success: true }); // Optional direct reply
            })
            .catch(error => {
                console.error('[Offscreen] FFmpeg getFFmpegInstance failed (from loadFFmpegOffscreen message):', error);
                runtimeAPI.runtime.sendMessage({ 
                    type: 'ffmpegStatusOffscreen', 
                    payload: { 
                        status: 'FFmpeg load failed in offscreen.', 
                        error: error.message || 'Unknown FFmpeg load error from getFFmpegInstance',
                        progress: 'error',
                        timestamp: new Date().toISOString()
                    } 
                }).catch(e => console.warn('[Offscreen] Error sending ffmpegStatusOffscreen (error) message:', e.message));
                // sendResponse({ success: false, error: error.message }); // Optional direct reply
            });
        return true; // Indicates async response to keep message channel open for potential sendResponse
    }
    // Standardize message type to 'runFFmpeg'
    else if (message.type === 'runFFmpeg') { 
        const { operationId, command, srcUrl, fileData, mediaType, fileName: inputFileNameFromPayload, file: inputFileObject, outputFileName } = message.payload;
        let ffmpegLocalRef; // Use a local reference for clarity within the promise chain
        console.log(`[Offscreen] Processing runFFmpeg message for opId: ${operationId}. Input source: ${srcUrl ? 'URL (' + srcUrl + ')' : fileData ? 'Direct ArrayBuffer' : 'Direct File Object'}. Command: ${command}`);

        getFFmpegInstance()
            .then(instance => {
                ffmpegLocalRef = instance;
                if (!ffmpegLocalRef || !FFMPEG_LOADED) { // Check our global flag
                    console.error(`[Offscreen] FFmpeg not loaded or ready for opId: ${operationId}. Loaded status: ${FFMPEG_LOADED}`);
                    throw new Error('FFmpeg is not loaded or ready for execution.');
                }

                // Input data handling (fetch from URL, use provided ArrayBuffer, or use blob data)
                if (srcUrl && typeof srcUrl === 'string') {
                    console.log(`[Offscreen] Fetching media from URL: ${srcUrl} for opId: ${operationId}`);
                    return fetch(srcUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Failed to fetch ${srcUrl}: ${response.status} ${response.statusText}`);
                            }
                            return response.arrayBuffer();
                        })
                        .then(arrayBuffer => {
                            const inputFilename = inputFileNameFromPayload || 'inputfile';
                            console.log(`[Offscreen] Fetched ${arrayBuffer.byteLength} bytes from ${srcUrl}. Writing to FFmpeg FS as ${inputFilename} for opId: ${operationId}`);
                            return ffmpegLocalRef.FS('writeFile', inputFilename, new Uint8Array(arrayBuffer));
                        });
                } else if (fileData) {
                    // Handle direct ArrayBuffer data (converted from blob URL in background script)
                    const inputFilename = inputFileNameFromPayload || 'inputfile';
                    console.log(`[Offscreen] Writing direct ArrayBuffer data: ${inputFilename} (size: ${fileData.byteLength}) for opId: ${operationId}`);
                    return ffmpegLocalRef.FS('writeFile', inputFilename, new Uint8Array(fileData));
                } else if (inputFileObject && inputFileObject.data instanceof ArrayBuffer) { 
                    const inputFilename = inputFileNameFromPayload || inputFileObject.name || 'inputfile';
                    console.log(`[Offscreen] Writing direct file: ${inputFilename} (size: ${inputFileObject.data.byteLength}) for opId: ${operationId}`);
                    return ffmpegLocalRef.FS('writeFile', inputFilename, new Uint8Array(inputFileObject.data));
                } else {
                    console.log(`[Offscreen] No srcUrl, fileData, or valid inputFileObject.data provided for opId: ${operationId}. Assuming file ${inputFileNameFromPayload} already exists or command does not need it.`);
                    return Promise.resolve(); // Resolve if no data to write or fetch
                }
            })
            .then(() => {
                const currentInputFileForExec = inputFileNameFromPayload || 'inputfile'; 
                let commandArray = Array.isArray(command) ? command : command.split(' ');

                // Handle special commands (get_duration, delete_file_please) or regular exec
                if (commandArray.length === 1 && commandArray[0] === 'get_duration') {
                    // This special command structure needs to be re-evaluated with v0.11.x
                    // FFmpeg v0.11 doesn't typically parse duration from stderr this way directly via a simple call.
                    // You might need to run a short FFmpeg command that outputs duration and capture it, or get it from metadata if possible.
                    // For now, this will likely fail or return 0 if not adapted.
                    console.warn(`[Offscreen] 'get_duration' special command needs review for FFmpeg v0.11.x compatibility.`);
                    // A simple way to get duration is often via ffprobe-like commands, or by processing the full file if short.
                    // This example will try to run ffmpeg -i input -f null - to get logs.
                    let durationLogs = '';
                    ffmpegLocalRef.on('log', ({ type, message: logMsg }) => { // Temporary log listener for duration
                        if (type === 'fferr') durationLogs += logMsg + '\n'; 
                    }); 
                    return ffmpegLocalRef.run('-i', currentInputFileForExec, '-f', 'null', '-') // ffmpeg.run takes varargs
                        .catch(e => console.log("[Offscreen] 'get_duration' (run -i ... -f null -) finished."))
                        .then(() => {
                            ffmpegLocalRef.on('log', function(logEvent) { /* restore original listener if any, or clear */ }); // Restore/clear temp listener
                            const durationMatch = durationLogs.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
                            let durationSeconds = 0;
                            if (durationMatch) {
                                durationSeconds = parseInt(durationMatch[1])*3600 + parseInt(durationMatch[2])*60 + parseInt(durationMatch[3]) + parseFloat("0." + durationMatch[4]);
                                console.log(`[Offscreen] Parsed duration for opId ${operationId}: ${durationSeconds}s from logs.`);
                                return { duration: durationSeconds, fileName: currentInputFileForExec }; 
                            } else {
                                console.warn(`[Offscreen] Could not parse duration from ffprobe-like logs for opId ${operationId}.`);
                                return { duration: 0, fileName: currentInputFileForExec }; 
                            }
                        });
                } else if (commandArray.length === 2 && commandArray[0] === 'delete_file_please') {
                    const fileToDelete = commandArray[1];
                    console.log(`[Offscreen] Special command: delete_file_please for opId: ${operationId} on file ${fileToDelete}`);
                    ffmpegLocalRef.FS('unlink', fileToDelete);
                    console.log(`[Offscreen] Successfully deleted ${fileToDelete} (FS.unlink called) for opId ${operationId}`);
                    return { deleted: true, fileName: fileToDelete }; 
                } else {
                    // Regular command execution
                    console.log(`[Offscreen] Executing FFmpeg command for opId: ${operationId} using input ${currentInputFileForExec}:`, commandArray.join(' '));
                    return ffmpegLocalRef.run(...commandArray).then(() => {
                        // For v0.11, ffmpeg.run() doesn't return stdout/stderr directly.
                        // Output files must be read from FS.
                        console.log(`[Offscreen] FFmpeg command completed for opId: ${operationId}. Output file expected at ${outputFileName}`);
                        return null; // Indicates to proceed to readFile step for regular commands
                    }); 
                }
            })
            .then((execResult) => { // execResult will be {duration: ...}, {deleted:true}, or null for regular commands
                if (execResult && typeof execResult.duration === 'number') {
                    return { customData: execResult }; // Pass duration data through
                } else if (execResult && execResult.deleted) {
                    return { customData: execResult }; // Pass deletion data through
                }
                // Regular command execution path: read the output file
                console.log(`[Offscreen] Reading output file: ${outputFileName} for opId: ${operationId}`);
                const data = ffmpegLocalRef.FS('readFile', outputFileName);
                return { data: data.buffer }; // Ensure it's an ArrayBuffer for consistency
            })
            .then((result) => { // result is {data: ArrayBuffer} or {customData:{duration: ...} or {deleted: ...}}
                const currentInputFile = inputFileNameFromPayload || 'inputfile';
                // Cleanup input and output files for regular operations
                if (result.data) { // It was a regular operation, not special like get_duration
                    try {
                         console.log(`[Offscreen] Deleting input file: ${currentInputFile} for opId: ${operationId}`);
                         ffmpegLocalRef.FS('unlink', currentInputFile);
                    } catch (e) { console.warn(`[Offscreen] Non-critical: Could not delete input file ${currentInputFile}: ${e.message}`); }
                    try {
                        console.log(`[Offscreen] Deleting output file: ${outputFileName} for opId: ${operationId}`);
                        ffmpegLocalRef.FS('unlink', outputFileName);
                    } catch (e) { console.warn(`[Offscreen] Non-critical: Could not delete output file ${outputFileName}: ${e.message}`); }
                }
                return result; // Forward the result (either data or customData)
            })
            .then((finalResult) => { 
                if (finalResult.customData && typeof finalResult.customData.duration === 'number') {
                    console.log(`[Offscreen] Duration command successful for opId: ${operationId}. Sending result.`);
                    runtimeAPI.runtime.sendMessage({
                        type: 'ffmpegResultOffscreen',
                        payload: { operationId, success: true, duration: finalResult.customData.duration, fileName: finalResult.customData.fileName }
                    }).catch(e => console.warn(`[Offscreen] Error sending duration success result for opId ${operationId}:`, e.message));
                } else if (finalResult.customData && finalResult.customData.deleted) {
                    console.log(`[Offscreen] File deletion command successful for opId: ${operationId}. File: ${finalResult.customData.fileName}`);
                    runtimeAPI.runtime.sendMessage({
                        type: 'ffmpegResultOffscreen',
                        payload: { operationId, success: true, deleted: true, fileName: finalResult.customData.fileName }
                    }).catch(e => console.warn(`[Offscreen] Error sending delete success result for opId ${operationId}:`, e.message));
                } else if (finalResult.data) {
                    console.log(`[Offscreen] FFmpeg command successful for opId: ${operationId}. Sending data result for ${outputFileName}.`);
                    runtimeAPI.runtime.sendMessage({
                        type: 'ffmpegResultOffscreen',
                        payload: { operationId, success: true, data: finalResult.data, fileName: outputFileName }
                    }).catch(e => console.warn(`[Offscreen] Error sending success data result for opId ${operationId}:`, e.message));
                } else {
                    // Should not happen if logic is correct
                    throw new Error('FFmpeg operation yielded undefined result structure.');
                }
                sendResponse({ success: true });
            })
            .catch(e => {
                console.error(`[Offscreen] FFmpeg run chain error for opId ${operationId}:`, e.message, e.stack);
                runtimeAPI.runtime.sendMessage({
                    type: 'ffmpegResultOffscreen',
                    payload: { operationId, success: false, error: e.message, fileName: outputFileName } // outputFileName might not be relevant if error was early
                }).catch(err => console.warn(`[Offscreen] Error sending error result for opId ${operationId}:`, err.message));
                sendResponse({ success: false, error: e.message });
            });
        return true; // Indicates async response
    }
    return false; // Default for unhandled messages
});

console.log('[Offscreen] Event listeners set up.'); 