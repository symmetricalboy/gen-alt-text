// public/offscreen-ffmpeg-handler.js
console.log('[Offscreen] Handler script loaded.');

const runtimeAPI = typeof browser !== 'undefined' ? browser : chrome;

let ffmpegInstance = null;
let FFMPEG_LOADED = false; // Tracks if newInstance.load() was successful
let loadInProgress = false;
let loadPromise = null;

// Import our new video processing module for compression operations
let videoProcessingModule = null;

// === IndexedDB Helper Functions ===
const DB_NAME = 'MediaProcessingDB';
const STORE_NAME = 'PendingFiles';
const DB_VERSION = 1;

async function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            console.error('[Offscreen] IndexedDB error:', request.error);
            reject(new Error('Error opening IndexedDB: ' + request.error?.name));
        };
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function getFileFromIndexedDB(key) {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onerror = () => {
            console.error('[Offscreen] IndexedDB get error:', request.error);
            reject(new Error('Error retrieving file: ' + request.error?.name));
        };
        request.onsuccess = () => resolve(request.result || null);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
            console.error('[Offscreen] IndexedDB get transaction error:', transaction.error);
            reject(new Error('Get transaction error: ' + transaction.error?.name));
        };
    });
}

// === End IndexedDB Helper Functions ===

// Load video processing module dynamically
async function loadVideoProcessingModule() {
    if (videoProcessingModule) return videoProcessingModule;
    
    try {
        // Try to load the video processing module from the correct extension path
        // First, try loading the web-compatible version that doesn't depend on TypeScript compilation
        try {
            videoProcessingModule = await import('./video-processing-web.js');
            console.log('[Offscreen] Video processing web module loaded successfully');
            return videoProcessingModule;
        } catch (webError) {
            console.warn('[Offscreen] Failed to load web module, trying alternative paths:', webError.message);
            
            // Fallback: try to construct the extension URL for the compiled module
            const moduleUrl = runtimeAPI.runtime.getURL('lib/video-processing.js');
            console.log('[Offscreen] Trying to load from extension URL:', moduleUrl);
            
            videoProcessingModule = await import(moduleUrl);
            console.log('[Offscreen] Video processing module loaded successfully from extension URL');
            return videoProcessingModule;
        }
    } catch (error) {
        console.error('[Offscreen] Failed to load video processing module:', error);
        console.error('[Offscreen] Available in global scope:', {
            hasVideoProcessing: typeof VideoProcessing !== 'undefined',
            hasWindow: typeof window !== 'undefined',
            hasDocument: typeof document !== 'undefined'
        });
        
        // Final fallback: check if VideoProcessing is available globally (from video-processing-web.js)
        if (typeof VideoProcessing !== 'undefined') {
            console.log('[Offscreen] Using globally available VideoProcessing object');
            videoProcessingModule = { VideoProcessing };
            return videoProcessingModule;
        }
        
        return null;
    }
}

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
            // For FFmpeg v0.11.x, we use createFFmpeg function
            let createFFmpegFunc = null;
            
            // Check for createFFmpeg function (v0.11.x style) - prioritize self.FFmpeg.createFFmpeg
            if (typeof self.FFmpeg === 'object' && self.FFmpeg !== null && typeof self.FFmpeg.createFFmpeg === 'function') {
                createFFmpegFunc = self.FFmpeg.createFFmpeg;
                console.log('[Offscreen] Found createFFmpeg at self.FFmpeg.createFFmpeg (v0.11.x)');
            } else if (typeof self.createFFmpeg === 'function') {
                createFFmpegFunc = self.createFFmpeg;
                console.log('[Offscreen] Found createFFmpeg at self.createFFmpeg (v0.11.x)');
            } else if (typeof createFFmpeg === 'function') {
                createFFmpegFunc = createFFmpeg;
                console.log('[Offscreen] Found createFFmpeg at global createFFmpeg (v0.11.x)');
            } else {
                // Debug what's actually available with detailed logging
                console.error('[Offscreen] createFFmpeg not found. Detailed debugging:');
                console.error('typeof self.createFFmpeg:', typeof self.createFFmpeg);
                console.error('typeof createFFmpeg:', typeof createFFmpeg);
                console.error('typeof self.FFmpeg:', typeof self.FFmpeg);
                console.error('typeof FFmpeg:', typeof FFmpeg);
                
                const ffmpegKeys = Object.keys(self).filter(k => k.toLowerCase().includes('ffmpeg'));
                console.error('FFmpeg-related keys in self:', ffmpegKeys);
                
                // Log all available keys for debugging
                console.error('All self keys:', Object.keys(self).slice(0, 20));
                
                // Show what's available for debugging
                if (typeof self.FFmpeg === 'object' && self.FFmpeg !== null) {
                    console.error('self.FFmpeg object keys:', Object.keys(self.FFmpeg));
                }
                
                // Check if there's a global FFmpeg with createFFmpeg
                if (typeof FFmpeg === 'object' && FFmpeg !== null) {
                    console.error('global FFmpeg object keys:', Object.keys(FFmpeg));
                    if (typeof FFmpeg.createFFmpeg === 'function') {
                        createFFmpegFunc = FFmpeg.createFFmpeg;
                        console.log('[Offscreen] Found createFFmpeg at FFmpeg.createFFmpeg');
                    }
                }
                
                if (!createFFmpegFunc) {
                    throw new Error('createFFmpeg function not found. Check if ffmpeg.min.js (v0.11.x) loaded correctly.');
                }
            }

            console.log('[Offscreen] Attempting to create FFmpeg instance (v0.11.x)...');
            
            // Create FFmpeg instance with explicit paths for v0.11.x
            const coreURL = runtimeAPI.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
            const wasmURL = runtimeAPI.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm');
            
            console.log('[Offscreen] FFmpeg core URLs:', { coreURL, wasmURL });
            
            // Test if files are accessible before creating FFmpeg instance
            console.log('[Offscreen] Testing file accessibility...');
            const coreExists = await checkFileExists(coreURL);
            const wasmExists = await checkFileExists(wasmURL);
            
            if (!coreExists) {
                throw new Error(`FFmpeg core file not accessible at: ${coreURL}`);
            }
            if (!wasmExists) {
                throw new Error(`FFmpeg WASM file not accessible at: ${wasmURL}`);
            }
            
            console.log('[Offscreen] Both core files are accessible, creating FFmpeg instance...');
            
            // Try alternative configuration for v0.11.x with locateFile function
            console.log('[Offscreen] Trying alternative configuration with locateFile function...');
            
            const newInstance = createFFmpegFunc({
                log: true, // Enable logging
                // Disable threading to avoid blob worker issues in Chrome MV3
                mainName: 'main',
                mt: false, // Disable multithreading to prevent blob worker creation
                
                // Use locateFile function to resolve paths dynamically
                locateFile: (path, scriptDirectory) => {
                    console.log('[Offscreen] locateFile called:', { path, scriptDirectory });
                    
                    // Map the expected files to our extension URLs
                    if (path === 'ffmpeg-core.wasm') {
                        const wasmURL = runtimeAPI.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm');
                        console.log('[Offscreen] Resolving ffmpeg-core.wasm to:', wasmURL);
                        return wasmURL;
                    }
                    if (path === 'ffmpeg-core.js') {
                        const coreURL = runtimeAPI.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
                        console.log('[Offscreen] Resolving ffmpeg-core.js to:', coreURL);
                        return coreURL;
                    }
                    if (path.includes('ffmpeg-core.worker.js')) {
                        // Return null for worker files to disable threading
                        console.log('[Offscreen] Disabling worker file to avoid CSP blob: issues');
                        return null;
                    }
                    
                    // Fallback to default resolution
                    console.log('[Offscreen] Using default path resolution for:', path);
                    return scriptDirectory + path;
                }
            });

            // Setup log and progress handlers for v0.11.x
            newInstance.setLogger(({ type, message }) => {
                console.log(`[FFmpeg Internal Log - ${type}] ${message}`);
                runtimeAPI.runtime.sendMessage({ 
                    type: 'ffmpegLogOffscreen', 
                    payload: { type: `core-${type}`, message } 
                }).catch(e => console.warn('[Offscreen] Error sending core log message:', e.message));
            });

            newInstance.setProgress(({ ratio, time, speed }) => { 
                console.log('[Offscreen] FFmpeg Load/Exec Progress (v0.11.x):', { ratio, time, speed });
                if (ratio !== undefined && ratio >= 0) {
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
                    payload: { status: 'FFmpeg v0.11.x instance created, loading core...', progress: 'start' }
                }).catch(e => console.warn('[Offscreen] Error sending FFmpeg load start message:', e.message));
            } catch (e) {
                console.warn('[Offscreen] Error sending FFmpeg load start message:', e);
            }
            
            console.log('[Offscreen] FFmpeg v0.11.x instance created. Now calling newInstance.load().');

            const loadTimeoutDuration = 60000; // 1 minute timeout
            const loadTimeout = setTimeout(() => {
                console.error(`[Offscreen] FFmpeg v0.11.x load() timed out after ${loadTimeoutDuration / 1000}s`);
                loadInProgress = false; // Reset progress flag
                reject(new Error(`FFmpeg v0.11.x load() timed out after ${loadTimeoutDuration / 1000}s. Check network connectivity and file availability.`));
            }, loadTimeoutDuration);

            try {
                console.log('[Offscreen] Calling newInstance.load() for v0.11.x...');
                console.log('[Offscreen] Core paths provided to createFFmpeg:', { coreURL, wasmURL });
                
                // For v0.11.x, load() doesn't take parameters - paths were specified in createFFmpeg()
                await newInstance.load();
                
                console.log('[Offscreen] FFmpeg v0.11.x load() returned successfully.');
            } catch (loadError) {
                console.error('[Offscreen] FFmpeg v0.11.x load() threw an error:', loadError);
                console.error('[Offscreen] Error details:', {
                    name: loadError.name,
                    message: loadError.message,
                    stack: loadError.stack
                });
                
                // Try to provide more specific error information
                if (loadError.message.includes('fetch')) {
                    console.error('[Offscreen] This appears to be a network/fetch error. Checking if files are still accessible...');
                    try {
                        await checkFileExists(coreURL);
                        await checkFileExists(wasmURL);
                    } catch (recheckError) {
                        console.error('[Offscreen] Recheck failed:', recheckError);
                    }
                }
                
                clearTimeout(loadTimeout);
                throw new Error(`FFmpeg load failed: ${loadError.message}. Core URL: ${coreURL}, WASM URL: ${wasmURL}`);
            }
            
            clearTimeout(loadTimeout);
            console.log('[Offscreen] FFmpeg v0.11.x load() completed successfully.');

            // Verify with a simple FS operation using v0.11.x API
            try {
                // FFmpeg.wasm v0.11.x uses .FS() method
                newInstance.FS('writeFile', 'test.txt', 'hello');
                const data = newInstance.FS('readFile', 'test.txt');
                newInstance.FS('unlink', 'test.txt');
                const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
                if (text === 'hello') {
                    console.log('[Offscreen] FFmpeg v0.11.x instance FS check passed.');
                } else {
                     throw new Error('FS check failed to verify read/write.');
                }
            } catch (verifyError) {
                console.error('[Offscreen] FFmpeg v0.11.x instance verification (FS check) failed after load():', verifyError);
                throw new Error(`FFmpeg v0.11.x instance verification failed: ${verifyError.message}`);
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

    // Ignore messages that are clearly not intended for offscreen (e.g., content script to background communication)
    if (!message.target) {
        // Only warn for messages that might be intended for offscreen but missing target
        if (message.type && (message.type.includes('ffmpeg') || message.type.includes('Offscreen') || message.type === 'runFFmpeg' || message.type === 'loadFFmpegOffscreen')) {
            console.warn('[Offscreen] Received message with no target property that might be intended for offscreen. Message:', message);
        }
        // Silently ignore other messages (like content script to background communication)
        return;
    }

    if (message.target !== 'offscreen-ffmpeg') {
        console.log('[Offscreen] Message target \'" + message.target + "\' not for offscreen-ffmpeg, ignoring.');
        return;
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
            
            // Do not use sendResponse, and do not indicate async response.
            return; 
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
                // Do not use sendResponse
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
                // Do not use sendResponse
            });
    }
    // Handle new compression operations
    else if (message.type === 'compressVideo') {
        const { operationId, fileData, indexedDbKey, fileName, mimeType, compressionSettings, fileSize } = message.payload;
        
        console.log(`[Offscreen] Received compressVideo message:`, {
            operationId,
            hasFileData: !!fileData,
            hasIndexedDbKey: !!indexedDbKey,
            fileName,
            mimeType,
            fileSize: fileSize ? `${(fileSize / (1024 * 1024)).toFixed(1)}MB` : 'unknown',
            compressionSettings
        });
        
        (async () => {
            try {
                let file;
                let actualFileSize;
                
                // Check if we have IndexedDB key or direct file data
                if (indexedDbKey) {
                    console.log(`[Offscreen] Processing compressVideo message for opId: ${operationId}. File: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(1)}MB) from IndexedDB key: ${indexedDbKey}`);
                    
                    // Get file from IndexedDB
                    const storedFile = await getFileFromIndexedDB(indexedDbKey);
                    if (!storedFile) {
                        throw new Error(`File not found in IndexedDB for key: ${indexedDbKey}`);
                    }
                    
                    file = storedFile;
                    actualFileSize = file.size;
                    console.log(`[Offscreen] Retrieved file from IndexedDB: ${fileName} (${(actualFileSize / (1024 * 1024)).toFixed(1)}MB)`);
                } else if (fileData) {
                    // Legacy direct file data approach
                    actualFileSize = fileSize || fileData.byteLength;
                    console.log(`[Offscreen] Processing compressVideo message for opId: ${operationId}. File: ${fileName} (${(actualFileSize / (1024 * 1024)).toFixed(1)}MB) from direct data`);
                    
                    // Create File object from the data
                    file = new File([fileData], fileName, { type: mimeType });
                    console.log(`[Offscreen] Created file object: ${fileName} (${(file.size / (1024 * 1024)).toFixed(1)}MB), type: ${file.type}`);
                } else {
                    throw new Error('No file data or IndexedDB key provided for compression');
                }

                console.log(`[Offscreen] Starting compression for ${fileName} (${(actualFileSize / (1024 * 1024)).toFixed(1)}MB)`);
                
                // Load video processing module
                const videoModule = await loadVideoProcessingModule();
                if (!videoModule) {
                    throw new Error('Video processing module not available');
                }

                console.log(`[Offscreen] Video module loaded:`, {
                    hasVideoProcessing: !!videoModule.VideoProcessing,
                    hasCompressVideo: !!videoModule.compressVideo,
                    videoModuleKeys: Object.keys(videoModule || {}),
                    globalVideoProcessing: typeof VideoProcessing !== 'undefined' ? !!VideoProcessing : false,
                    globalVideoProcessingKeys: typeof VideoProcessing !== 'undefined' ? Object.keys(VideoProcessing) : []
                });
                
                // Also check global VideoProcessing object directly
                console.log('[Offscreen] Global VideoProcessing check:', {
                    available: typeof VideoProcessing !== 'undefined',
                    hasCompressVideo: typeof VideoProcessing !== 'undefined' && !!VideoProcessing.compressVideo,
                    object: typeof VideoProcessing !== 'undefined' ? VideoProcessing : 'undefined'
                });

                // Perform compression using our module
                // Handle different module export formats
                let compressVideoFunc;
                if (videoModule.VideoProcessing && videoModule.VideoProcessing.compressVideo) {
                    // Web module format
                    compressVideoFunc = videoModule.VideoProcessing.compressVideo;
                    console.log('[Offscreen] Using VideoProcessing.compressVideo from web module');
                } else if (videoModule.compressVideo) {
                    // Direct export format
                    compressVideoFunc = videoModule.compressVideo;
                    console.log('[Offscreen] Using direct compressVideo export');
                } else if (typeof VideoProcessing !== 'undefined' && VideoProcessing.compressVideo) {
                    // Global VideoProcessing object format
                    compressVideoFunc = VideoProcessing.compressVideo;
                    console.log('[Offscreen] Using global VideoProcessing.compressVideo');
                } else {
                    console.error('[Offscreen] Available module contents:', videoModule);
                    console.error('[Offscreen] Global VideoProcessing:', typeof VideoProcessing !== 'undefined' ? VideoProcessing : 'undefined');
                    throw new Error('compressVideo function not found in loaded module or global scope');
                }
                
                console.log('[Offscreen] Compression settings:', compressionSettings);
                
                const result = await compressVideoFunc(file, compressionSettings, (progress) => {
                    console.log(`[Offscreen] Compression progress: ${progress}`);
                    // Send progress updates back to background
                    runtimeAPI.runtime.sendMessage({
                        type: 'compressionProgress',
                        operationId,
                        message: progress
                    }).catch(e => console.warn('[Offscreen] Error sending progress:', e.message));
                });
                
                console.log('[Offscreen] Compression result:', {
                    hasResult: !!result,
                    hasBlob: !!(result?.blob),
                    originalSize: result?.originalSize,
                    compressedSize: result?.compressedSize,
                    compressionRatio: result?.compressionRatio
                });
                
                if (result && result.blob) {
                    // Convert blob to array buffer for sending back
                    const arrayBuffer = await result.blob.arrayBuffer();
                    
                    console.log(`[Offscreen] Compression successful: ${(result.originalSize / (1024 * 1024)).toFixed(1)}MB → ${(result.compressedSize / (1024 * 1024)).toFixed(1)}MB (${result.compressionRatio.toFixed(1)}% reduction)`);
                    
                    sendResponse({
                        success: true,
                        data: arrayBuffer,
                        originalSize: result.originalSize,
                        compressedSize: result.compressedSize,
                        compressionRatio: result.compressionRatio,
                        codec: result.codec,
                        quality: result.quality
                    });
                } else {
                    console.error('[Offscreen] Compression failed - no result or no blob:', result);
                    throw new Error('Compression failed - no result returned');
                }
            } catch (error) {
                console.error('[Offscreen] Compression error:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
        })();
        
        return true; // Indicate async response
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
            .then(async () => {
                const currentInputFileForExec = inputFileNameFromPayload || 'inputfile'; 
                let commandArray = Array.isArray(command) ? command : command.split(' ');

                // Handle special commands (get_duration, delete_file_please) or regular exec
                if (commandArray.length === 1 && commandArray[0] === 'get_duration') {
                    // For v0.11.x, get duration using ffprobe-like command
                    console.log(`[Offscreen] 'get_duration' special command for opId: ${operationId} using v0.11.x`);
                    let durationLogs = '';
                    const originalLogger = ffmpegLocalRef.setLogger;
                    ffmpegLocalRef.setLogger(({ type, message: logMsg }) => { 
                        if (type === 'fferr') durationLogs += logMsg + '\n'; 
                    }); 
                    return ffmpegLocalRef.run('-i', currentInputFileForExec, '-f', 'null', '-') // ffmpeg.run takes varargs for v0.11.x
                        .catch(e => console.log("[Offscreen] 'get_duration' (run -i ... -f null -) finished."))
                        .then(() => {
                            ffmpegLocalRef.setLogger(originalLogger); // Restore original logger
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
                    console.log(`[Offscreen] Successfully deleted ${fileToDelete} (FS unlink called) for opId ${operationId}`);
                    return { deleted: true, fileName: fileToDelete }; 
                } else {
                    // Regular command execution for v0.11.x
                    console.log(`[Offscreen] Executing FFmpeg command for opId: ${operationId} using input ${currentInputFileForExec}:`, commandArray.join(' '));
                    return ffmpegLocalRef.run(...commandArray).then(() => {
                        // FFmpeg v0.11.x run() doesn't return stdout/stderr directly.
                        // Output files must be read from FS.
                        console.log(`[Offscreen] FFmpeg command completed for opId: ${operationId}. Output file expected at ${outputFileName}`);
                        return null; // Indicates to proceed to readFile step for regular commands
                    }); 
                }
            })
            .then(async (execResult) => { // execResult will be {duration: ...}, {deleted:true}, or null for regular commands
                if (execResult && typeof execResult.duration === 'number') {
                    return { customData: execResult }; // Pass duration data through
                } else if (execResult && execResult.deleted) {
                    return { customData: execResult }; // Pass deletion data through
                }
                // Regular command execution path: read the output file
                console.log(`[Offscreen] Reading output file: ${outputFileName} for opId: ${operationId}`);
                const data = ffmpegLocalRef.FS('readFile', outputFileName);
                // Ensure it's an ArrayBuffer for consistency. The result now includes success and fileName.
                // FFmpeg v0.11.x FS('readFile') returns Uint8Array
                const arrayBuffer = data instanceof ArrayBuffer ? data : data.buffer;
                return { success: true, data: arrayBuffer, fileName: outputFileName };
            })
            .then(async (result) => { // result is {data: ArrayBuffer} or {customData:{duration: ...} or {deleted: ...}}
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
                console.log(`[Offscreen] FFmpeg command successful for opId: ${operationId}. Sending response.`);
                // Use sendResponse to return the result directly
                sendResponse(finalResult);
            })
            .catch(e => {
                console.error(`[Offscreen] FFmpeg run chain error for opId ${operationId}:`, e.message, e.stack);
                // Use sendResponse to return the error
                sendResponse({
                    success: false,
                    error: e.message,
                    fileName: outputFileName // outputFileName might not be relevant if error was early
                });
            });
        return true; // Indicates async response - This is crucial!
    }
    return; // Default for unhandled messages, no async response.
});

console.log('[Offscreen] Event listeners set up.');

// Automatically start loading FFmpeg when the script is loaded
(async () => {
    console.log('[Offscreen] Auto-loading FFmpeg instance...');
    try {
        await getFFmpegInstance();
        console.log('[Offscreen] FFmpeg auto-load successful.');
        
        // Notify background script that FFmpeg is ready
        try {
            runtimeAPI.runtime.sendMessage({ 
                type: 'ffmpegStatusOffscreen', 
                payload: { 
                    status: 'FFmpeg loaded and ready in offscreen document (auto-load).', 
                    progress: 'complete', 
                    timestamp: new Date().toISOString() 
                }
            }).catch(e => console.warn('[Offscreen] Error sending auto-load complete message:', e.message));
        } catch (e) {
            console.warn('[Offscreen] Error sending auto-load complete message:', e);
        }
    } catch (error) {
        console.error('[Offscreen] FFmpeg auto-load failed:', error);
        
        // Notify background script of auto-load failure
        try {
            runtimeAPI.runtime.sendMessage({ 
                type: 'ffmpegStatusOffscreen', 
                payload: { 
                    status: 'FFmpeg auto-load failed in offscreen document.', 
                    error: error.message || 'Unknown FFmpeg auto-load error',
                    progress: 'error',
                    timestamp: new Date().toISOString()
                } 
            }).catch(e => console.warn('[Offscreen] Error sending auto-load error message:', e.message));
        } catch (e) {
            console.warn('[Offscreen] Error sending auto-load error message:', e);
        }
    }
})(); 