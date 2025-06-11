// import { browser as polyfillBrowser } from 'webextension-polyfill'; // Removed import
import browser from 'webextension-polyfill';

// Extend the browser types to include offscreen
declare module 'webextension-polyfill' {
  namespace browser {
    namespace offscreen {
      enum Reason {
        BLOBS = 'BLOBS',
        CLIPBOARD = 'CLIPBOARD',
        DOM = 'DOM',
        USER_MEDIA = 'USER_MEDIA',
        WEB_NAVIGATION = 'WEB_NAVIGATION'
      }

      function createDocument(options: {
        url: string;
        reasons: Reason[];
        justification: string;
      }): Promise<void>;

      function hasDocument(): Promise<boolean>;
    }

    namespace runtime {
      enum ContextType {
        BACKGROUND = 'BACKGROUND_PAGE',
        POPUP = 'POPUP',
        OFFSCREEN_DOCUMENT = 'OFFSCREEN_DOCUMENT'
      }

      function getContexts(options: {
        contextTypes: ContextType[];
        documentUrls?: string[];
      }): Promise<ExtensionContext[]>;

      interface ExtensionContext {
        contextType: ContextType;
        documentUrl?: string;
      }
    }
  }
}

// --- IndexedDB Helper Functions ---
const DB_NAME = 'MediaProcessingDB';
const STORE_NAME = 'PendingFiles';
const DB_VERSION = 1;

async function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            console.error('[Background] IndexedDB error:', request.error);
            reject(new Error('Error opening IndexedDB: ' + request.error?.name));
        };
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function storeFileInDB(key: IDBValidKey, file: File | Blob): Promise<IDBValidKey> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(file, key);
        request.onerror = () => {
            console.error('[Background] IndexedDB store error:', request.error);
            reject(new Error('Error storing file: ' + request.error?.name));
        };
        request.onsuccess = () => resolve(request.result);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
            console.error('[Background] IndexedDB store transaction error:', transaction.error);
            reject(new Error('Store transaction error: ' + transaction.error?.name));
        };
    });
}

async function getFileFromDB(key: IDBValidKey): Promise<File | Blob | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onerror = () => {
            console.error('[Background] IndexedDB get error:', request.error);
            reject(new Error('Error retrieving file: ' + request.error?.name));
        };
        request.onsuccess = () => resolve(request.result || null);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
            console.error('[Background] IndexedDB get transaction error:', transaction.error);
            reject(new Error('Get transaction error: ' + transaction.error?.name));
        };
    });
}

async function deleteFileFromDB(key: IDBValidKey): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onerror = () => {
            console.error('[Background] IndexedDB delete error:', request.error);
            reject(new Error('Error deleting file: ' + request.error?.name));
        };
        request.onsuccess = () => resolve();
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
            console.error('[Background] IndexedDB delete transaction error:', transaction.error);
            reject(new Error('Delete transaction error: ' + transaction.error?.name));
        };
    });
}
// --- End IndexedDB Helper Functions ---


// Assuming ffmpeg.js UMD is loaded globally or via importScripts.
// The actual ffmpeg.js and ffmpeg-core.js/wasm should be in /public/assets/ffmpeg/

const CLOUD_FUNCTION_URL = 'https://us-central1-symm-gemini.cloudfunctions.net/generateAltTextProxy';
const SINGLE_FILE_DIRECT_LIMIT = 19 * 1024 * 1024; // 19MB
const MAX_CHUNKS = 15; 

let contentScriptPort: any = null; // Changed to any to avoid type errors

// Helper function to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = self.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// --- Type definitions for FFmpeg operations and messages ---

interface FFmpegSuccessResultBase {
    success: true;
    fileName: string;
}

interface FFmpegDataResult extends FFmpegSuccessResultBase {
    data: ArrayBuffer;
    duration?: never;
    deleted?: never;
}

interface FFmpegDurationResult extends FFmpegSuccessResultBase {
    duration: number;
    data?: never;
    deleted?: never;
}

interface FFmpegDeleteResult extends FFmpegSuccessResultBase {
    deleted: true;
    data?: never;
    duration?: never;
}

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

// Payload from content script when using IndexedDB
interface ProcessLargeMediaFromIndexedDBPayload {
    indexedDbKey: string; // Key to retrieve the File/Blob from IndexedDB
    name: string;         // Original file name
    type: string;         // Original file type
    size: number;         // Original file size
    generationType: 'altText' | 'captions';
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

// This interface is now for the function that does the core processing AFTER data is retrieved
// interface ProcessLargeMediaPayload { // This was the old one, for direct ArrayBuffer transfer
//     name: string; 
//     type: string; 
//     size: number; 
//     arrayBuffer: ArrayBuffer; 
//     generationType: 'altText' | 'captions';
//     videoMetadata?: { 
//         duration?: number;
//         width?: number;
//         height?: number;
//     } | null;
// }


// --- Offscreen Document Logic ---
const OFFSCRREN_DOCUMENT_PATH = 'offscreen.html'; // Removed leading slash

const ffmpegOperations = new Map<number, { resolve: (value: FFmpegResolvedOperationOutput) => void, reject: (reason?: any) => void }>();
let operationIdCounter = 0;

async function hasOffscreenDocument(): Promise<boolean> {
    // Use any to bypass type checking for offscreen API
    const offscreen = (browser as any).offscreen;
    if (offscreen && offscreen.hasDocument) {
        const existing = await offscreen.hasDocument();
        if (existing) console.log('[Background] Offscreen document exists.');
        else console.log('[Background] No offscreen document found.');
        return existing;
    }
    console.log('[Background] browser.offscreen.hasDocument not available, using getContexts fallback.');
    // Use any to bypass type checking for getContexts
    const contexts: any[] = await (browser.runtime as any).getContexts({
        contextTypes: [(browser.runtime as any).ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [browser.runtime.getURL(OFFSCRREN_DOCUMENT_PATH)]
    });
    return contexts ? contexts.length > 0 : false;
}

async function setupOffscreenDocument(): Promise<boolean> {
    const docExists = await hasOffscreenDocument();
    if (!docExists) {
        console.log('[Background] Creating offscreen document...');
        // Use any to bypass type checking for createDocument
        await (browser as any).offscreen.createDocument({
            url: OFFSCRREN_DOCUMENT_PATH,
            reasons: [(browser as any).offscreen.Reason.BLOBS, (browser as any).offscreen.Reason.USER_MEDIA],
            justification: 'FFmpeg processing for media files.',
        });
        console.log('[Background] Offscreen document requested for creation.');
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                console.error('[Background] Timeout waiting for offscreen FFmpeg to load.');
                browser.runtime.onMessage.removeListener(initialLoadListener);
                reject(new Error('Timeout waiting for offscreen FFmpeg to load.'));
            }, 300000); // 5 minutes timeout

            const initialLoadListener = (message: any, sender: any) => {
                // Ensure the message is from our offscreen document
                if (sender.url && sender.url.endsWith(OFFSCRREN_DOCUMENT_PATH) && message.type === 'ffmpegStatusOffscreen') {
                    console.log('[Background] Received ffmpegStatusOffscreen:', message.payload);

                    if (message.payload) {
                        // Case 1: Offscreen reports its scripts (including handler) are loaded
                        if (message.payload.progress === 'scripts-loaded') {
                            console.log('[Background] Offscreen scripts loaded. Sending loadFFmpegOffscreen command.');
                            browser.runtime.sendMessage({ target: 'offscreen-ffmpeg', type: 'loadFFmpegOffscreen' })
                                .catch((err: Error) => { 
                                    console.error('[Background] Error sending loadFFmpegOffscreen message after scripts loaded:', err.message);
                                    clearTimeout(timeoutId);
                                    browser.runtime.onMessage.removeListener(initialLoadListener);
                                    reject(new Error(`Failed to send loadFFmpegOffscreen message: ${err.message}`));
                                });
                            // Keep listening for the 'complete' or 'error' status for FFmpeg itself
                            return false; // Indicate message handled, but promise not yet resolved
                        }
                        // Case 2: FFmpeg fully loaded and ready in offscreen
                        // The 'FFmpeg loaded in offscreen document.' status is sent by offscreen-ffmpeg-handler.js
                        // when its getFFmpegInstance() resolves successfully upon 'loadFFmpegOffscreen' message.
                        else if (message.payload.progress === 'complete' && message.payload.status === 'FFmpeg loaded in offscreen document.') {
                            clearTimeout(timeoutId);
                            browser.runtime.onMessage.removeListener(initialLoadListener);
                            console.log('[Background] Confirmed: FFmpeg loaded successfully in offscreen document.');
                            resolve(true);
                            return true; // Indicate message handled and promise resolved
                        }
                        // Case 3: An error occurred during loading in offscreen
                        else if (message.payload.progress === 'error') {
                            clearTimeout(timeoutId);
                            browser.runtime.onMessage.removeListener(initialLoadListener);
                            const errorMsg = message.payload.error || 'Unknown error during offscreen FFmpeg loading.';
                            console.error('[Background] Offscreen document reported FFmpeg load error:', errorMsg);
                            reject(new Error('Offscreen FFmpeg load failed: ' + errorMsg));
                            return true; // Indicate message handled and promise resolved (rejected)
                        }
                        // Other progress messages (e.g., 'start', 'ongoing') can be logged but don't resolve/reject yet
                        else if (message.payload.status) {
                             console.log(`[Background] FFmpeg loading progress: ${message.payload.status} at ${message.payload.timestamp || new Date().toISOString()}`);
                        }
                    }
                }
                return false; // Return false if the message is not handled or to continue listening
            };
            browser.runtime.onMessage.addListener(initialLoadListener);

            // The loadFFmpegOffscreen message is now sent when 'scripts-loaded' is received.
            // No initial message send from here.
            console.log('[Background] Waiting for offscreen document to signal script readiness...');
        });
    } else {
        console.log('[Background] Offscreen document already exists. Assuming FFmpeg ready or will be handled.');
        // Potentially verify readiness or re-trigger load if necessary, but for now assume ready
        return true; 
    }
}

// Unified listener for all runtime messages
browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response?: any) => void): true => {
    // 1. Handle messages from the Offscreen Document
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
                    } else if (data instanceof ArrayBuffer || (typeof data === 'object' && data && typeof data.byteLength === 'number')) { 
                        resultPayload = { success: true, fileName, data: data as ArrayBuffer };
                    } else if (deleted === true) {
                        resultPayload = { success: true, fileName, deleted };
                    } else {
                        operation.reject(new Error('Unknown successful FFmpeg result structure from offscreen.'));
                        ffmpegOperations.delete(operationId);
                        return true;
                    }
                    operation.resolve(resultPayload);
                } else {
                    operation.reject(new Error(error || 'Unknown FFmpeg offscreen error.'));
                }
                ffmpegOperations.delete(operationId);
            } else {
                console.warn("[Background] Unknown operationId received for ffmpegResultOffscreen.");
            }
        } else if (message.type === 'ffmpegStatusOffscreen') {
            if (message.payload && message.payload.status === 'FFmpeg loaded in offscreen document.') {
                console.log('[Background] General listener caught FFmpeg loaded confirmation from offscreen.');
                // This might be part of the setupOffscreenDocument promise chain, no sendResponse here.
            } else if (message.payload && message.payload.progress) {
                // Handle progress messages 
                const { progress, status, timestamp } = message.payload;
                console.log(`[Background] FFmpeg loading progress: ${status}${timestamp ? ` at ${timestamp}` : ''}`);
                
                // Forward progress to content script if connected
                if (contentScriptPort) {
                    contentScriptPort.postMessage({ 
                        type: 'ffmpegStatus', 
                        status: status,
                        loading: progress !== 'complete',
                        firstLoadMessage: progress === 'start' || progress === 'ongoing' 
                            ? 'FFmpeg is loading. The first load can take up to 5 minutes. Future loads will be faster.'
                            : undefined
                    });
                }
            }
            return true;
        }
        return true;
    }
    
    // 2. Handle messages from Content Scripts (e.g., initial data transfer)
    if (message.type === 'processLargeMediaViaSendMessage') {
        console.log('[Background] Received processLargeMediaViaSendMessage with payload:', message.payload);

        const { mediaSrcUrl, fileName, mediaType, generationType, videoMetadata } = message.payload;

        if (typeof mediaSrcUrl !== 'string' || mediaSrcUrl.length === 0) {
            console.error('[Background] Invalid mediaSrcUrl received via sendMessage:', mediaSrcUrl);
            sendResponse({ error: 'Invalid mediaSrcUrl received by background script.' });
            return true;
        }
        if (typeof fileName !== 'string' || fileName.length === 0) {
            console.error('[Background] Invalid fileName received via sendMessage:', fileName);
            sendResponse({ error: 'Invalid fileName received by background script.' });
            return true;
        }
        if (typeof mediaType !== 'string' || mediaType.length === 0) {
            console.error('[Background] Invalid mediaType received via sendMessage:', mediaType);
            sendResponse({ error: 'Invalid mediaType received by background script.' });
            return true;
        }

        // We are not storing anything in IDB here anymore from this message.
        // We directly call the processing logic, which will handle fetching/FFmpeg via offscreen.
        sendResponse({ success: true, message: 'Background received media source URL for processing.' });

        if (contentScriptPort) {
            // Rename ProcessLargeMediaFromIndexedDBPayload or create a new suitable interface if structure differs significantly
            // For now, let's adapt its call, assuming processMediaWithFFmpegAndCloud will be adapted or a new orchestrator created
            // The main change is that `file` (Blob/File) is replaced by `mediaSrcUrl` and `mediaType`.
            // `processMediaWithFFmpegAndCloud` will need to be updated to fetch from URL if it's for FFmpeg.
            
            // Directly call the main processing function. It needs to be adapted to take srcUrl.
            processMediaWithUrl(
                mediaSrcUrl,
                fileName,
                mediaType,
                generationType,
                contentScriptPort,
                videoMetadata
            ).catch((err: Error) => {
                console.error('[Background] Error after triggering processMediaWithUrl:', err.message);
                // Errors from processMediaWithUrl should be posted to contentScriptPort from within that function
            });
        } else {
            console.error('[Background] No active content script port to send results to after receiving media source URL.');
            // No IDB key to clean up here if we didn't store one
        }
        
        return true; // Asynchronous response (sendResponse called above), and further processing is async.
    }
    
    console.log('[Background] Message not handled by primary listener:', message.type);
    return false as any;
});

// Remove deprecated Chrome API usage - now using webextension-polyfill

// ... (Rest of the file: runFFmpegInOffscreen, getMediaDurationViaFFmpeg, etc. ...)
// ... (handleProcessLargeMediaFromIndexedDB, processMediaWithFFmpegAndCloud) ...

// WXT entry point
export default {
    main() {
        console.log('[Background] Service worker main() executed. Setting up listeners.');

        // Start loading FFmpeg right away when the extension starts
        console.log('[Background] Preloading FFmpeg on browser start...');
        setupOffscreenDocument().catch((err: Error) => {
            console.warn("[Background] Initial FFmpeg preloading failed:", err.message);
        });

        // Listener for long-lived port connections from content scripts
        browser.runtime.onConnect.addListener((port: any) => {
            if (port.name === 'content-script-port') {
                if (contentScriptPort && contentScriptPort !== port) {
                    console.log('[Background] New content script connection, previous port will be replaced.');
                }
                contentScriptPort = port;
                console.log('[Background] Content script connected via port:', port.sender?.tab?.id ? `Tab ID ${port.sender.tab.id}` : 'Unknown tab');

                // When a port connects, let it know if FFmpeg is still loading
                setupOffscreenDocument().catch((err: Error) => {
                    console.warn("[Background] Initial Offscreen Document setup/FFmpeg load failed on connect:", err.message);
                    if (contentScriptPort && contentScriptPort === port) { 
                        contentScriptPort.postMessage({ 
                            type: 'ffmpegStatus', 
                            status: 'FFmpeg initial setup error: ' + err.message, 
                            error: true,
                            firstLoadMessage: 'FFmpeg is loading. The first load can take up to 5 minutes. Future loads will be faster.'
                        });
                    }
                });

                port.onMessage.addListener(async (message: any) => { 
                    let payloadSummary = "No payload or unrecognized structure";
                    if (message.payload) {
                        if (message.payload.indexedDbKey) {
                             payloadSummary = `{indexedDbKey: ${message.payload.indexedDbKey}, name: ${message.payload.name}, type: ${message.payload.type}}`;
                        } else if (message.payload.arrayBuffer instanceof ArrayBuffer) {
                            payloadSummary = `{name: ${message.payload.name}, arrayBuffer: ArrayBuffer(size=${message.payload.arrayBuffer.byteLength})}`;
                        } else if (message.payload.arrayBuffer) {
                             payloadSummary = `{name: ${message.payload.name}, arrayBuffer: Non-ArrayBuffer type: ${typeof message.payload.arrayBuffer}}`;
                        } else {
                            payloadSummary = JSON.stringify(message.payload).substring(0, 200) + "...";
                        }
                    }
                    console.log('[Background] Port message from content script:', message.type, payloadSummary);

                    if (message.type === 'ping') {
                        port.postMessage({ type: 'pong' });
                    }
                });

                port.onDisconnect.addListener(() => {
                    console.log('[Background] Content script port disconnected:', port.sender?.tab?.id ? `Tab ID ${port.sender.tab.id}` : 'Unknown tab');
                    if (contentScriptPort === port) { 
                        contentScriptPort = null;
                        console.log('[Background] Active content script port cleared.');
                    }
                });
            }
        });
        console.log('[Background] onConnect listener attached.');
    },
};

console.log('[Background] Background script loaded (listeners will be set up in main when service worker executes).');

// Placeholder function definitions
async function runFFmpegInOffscreen(mediaInput: {srcUrl: string, mediaType: string, fileName: string} | {fileBlob: File | Blob, fileName: string}, commandArgs: string[], operationName: string): Promise<FFmpegResolvedOperationOutput> {
    // const fileName = (file instanceof File && file.name) ? file.name : 'input_blob';
    // console.log(`[runFFmpegInOffscreen] Placeholder for ${operationName} with file ${fileName}`);
    console.log(`[runFFmpegInOffscreen] Operation: ${operationName}. Input:`, mediaInput);

    try {
        // Make sure we properly await the setupOffscreenDocument promise
        const offscreenReady = await setupOffscreenDocument();
        if (!offscreenReady) {
            throw new Error(`Failed to ensure offscreen document is ready. Cannot run FFmpeg operation ${operationName}.`);
        }
        console.log(`[runFFmpegInOffscreen] Offscreen document is ready for operation: ${operationName}`);
    } catch (error: any) {
        console.error(`[runFFmpegInOffscreen] Error setting up offscreen document: ${error.message}`);
        throw error;
    }

    operationIdCounter++;
    const currentOperationId = operationIdCounter;

    // Pre-fetch blob URLs to convert them to ArrayBuffer directly
    // Offscreen document often can't access blob URLs from other contexts
    let ffmpegPayloadInputPart: any;
    let logFileName: string;

    if ('srcUrl' in mediaInput) {
        logFileName = mediaInput.fileName;
        
        // Check if it's a blob URL and fetch it if necessary
        if (mediaInput.srcUrl.startsWith('blob:') || mediaInput.srcUrl.startsWith('data:')) {
            console.log(`[runFFmpegInOffscreen] Detected blob or data URL. Fetching content in background script for ${operationName}...`);
            try {
                const response = await fetch(mediaInput.srcUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch from blob/data URL: ${response.status} ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                console.log(`[runFFmpegInOffscreen] Successfully fetched ${arrayBuffer.byteLength} bytes from blob/data URL`);
                
                // Pass the file data directly instead of the URL
                ffmpegPayloadInputPart = { 
                    fileData: arrayBuffer, 
                    mediaType: mediaInput.mediaType, 
                    fileName: mediaInput.fileName 
                };
            } catch (fetchError: any) {
                console.error(`[runFFmpegInOffscreen] Error fetching blob/data URL: ${fetchError.message}`);
                throw new Error(`Failed to fetch blob/data URL content: ${fetchError.message}`);
            }
        } else {
            // Regular URL - let offscreen handler handle it
            ffmpegPayloadInputPart = { 
                srcUrl: mediaInput.srcUrl, 
                mediaType: mediaInput.mediaType, 
                fileName: mediaInput.fileName 
            };
        }
    } else {
        // Direct file blob
        ffmpegPayloadInputPart = { file: mediaInput.fileBlob, fileName: mediaInput.fileName }; 
        logFileName = mediaInput.fileName;
    }

    return new Promise((resolve, reject) => {
        ffmpegOperations.set(currentOperationId, { resolve, reject });

        const outputFileNameBase = logFileName.includes('.') ? logFileName.substring(0, logFileName.lastIndexOf('.')) : logFileName;
        const finalOutputFileName = commandArgs.includes('-f') && commandArgs.includes('vtt')
            ? outputFileNameBase + '.vtt' 
            : outputFileNameBase + '.processed';

        const messagePayload = {
            target: 'offscreen-ffmpeg',
            type: 'runFFmpeg',
            payload: {
                operationId: currentOperationId,
                ...ffmpegPayloadInputPart, // Contains fileData/mediaType/fileName OR srcUrl/mediaType/fileName OR file/fileName
                // fileName and outputFileName are now set based on mediaInput and commandArgs
                outputFileName: finalOutputFileName, // This was already being constructed
                command: commandArgs.join(' ')
            }
        };
        console.log('[Background] Sending runFFmpeg message to offscreen:', messagePayload);
        browser.runtime.sendMessage(messagePayload)
            .catch(err => {
                console.error(`[Background] Error sending FFmpeg command to offscreen for ${operationName}:`, err);
                ffmpegOperations.delete(currentOperationId);
                reject(new Error(`Failed to send command to offscreen: ${err.message}`));
            });
    });
}

async function getMediaDurationViaFFmpeg(mediaSrcUrl: string, mediaType: string, fileName: string): Promise<number> {
    console.log('[getMediaDurationViaFFmpeg] for URL:', mediaSrcUrl);
    const result = await runFFmpegInOffscreen({srcUrl: mediaSrcUrl, mediaType, fileName}, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fileName], 'getDuration');
    if (result.success && typeof result.duration === 'number') {
        return result.duration;
    }
    // If direct duration not returned, FFmpeg in offscreen might return data output (stdout)
    if (result.success && result.data) {
        const outputString = new TextDecoder().decode(result.data);
        const duration = parseFloat(outputString.trim());
        if (!isNaN(duration)) return duration;
    }
    throw new Error('Could not get media duration via FFmpeg.');
}


// Renamed from processMediaWithFFmpegAndCloud and adapted for URL input
async function processMediaWithUrl(
    mediaSrcUrl: string,
    fileName: string, // Original fileName from content script
    mediaType: string,
    generationType: 'altText' | 'captions',
    port: any, // Changed to any to avoid type errors
    videoMetadata?: { duration?: number; width?: number; height?: number } | null
): Promise<void> {
    console.log(`[processMediaWithUrl] Processing ${fileName} (${mediaType}) for ${generationType} from URL: ${mediaSrcUrl}`);
    try {
        port.postMessage({ type: 'progress', message: `Processing ${fileName}...`, originalSrcUrl: mediaSrcUrl });

        const isGeneratingCaptions = generationType === 'captions';

        if (isGeneratingCaptions) {
            const vttResult = await runFFmpegInOffscreen({srcUrl: mediaSrcUrl, mediaType, fileName}, ['-i', fileName, '-an', '-vn', '-scodec', 'webvtt', '-f', 'vtt', 'output.vtt'], 'generateVTT');
            if (vttResult.success && vttResult.data) {
                const vttContent = new TextDecoder().decode(vttResult.data);
                port.postMessage({ type: 'captionResult', vttResults: [{fileName: vttResult.fileName || fileName + '.vtt', vttContent }], originalSrcUrl: mediaSrcUrl });
            } else {
                throw new Error('FFmpeg failed to produce VTT output or data was not ArrayBuffer.');
            }
        } else if (generationType === 'altText') {
            // For alt text, if it's a video, we might need FFmpeg to extract a frame first.
            // If it's an image, we might fetch it and send to cloud.
            // This logic needs to be more robust.

            let dataForCloud: { base64Data: string; mimeType: string; fileSize: number; };

            if (mediaType.startsWith('video/') || mediaType === 'image/gif') { // Needs FFmpeg processing for a still frame for alt text
                port.postMessage({ type: 'progress', message: `Extracting frame from ${fileName} for alt text...`, originalSrcUrl: mediaSrcUrl });
                // Example: extract first frame as JPEG
                const frameResult = await runFFmpegInOffscreen(
                    { srcUrl: mediaSrcUrl, mediaType, fileName }, 
                    ['-i', fileName, '-vf', 'select=eq(n\,0)', '-q:v', '3', 'frame.jpg', '-f', 'image2'], 
                    'extractFrame'
                );
                if (frameResult.success && frameResult.data) {
                    const imageBase64 = uint8ArrayToBase64(new Uint8Array(frameResult.data)); // Helper needed
                    dataForCloud = {
                        base64Data: imageBase64,
                        mimeType: 'image/jpeg', // Output of FFmpeg command
                        fileSize: frameResult.data.byteLength
                    };
                } else {
                    throw new Error('FFmpeg failed to extract frame for alt text.');
                }
            } else if (mediaType.startsWith('image/')) { // Direct image, fetch and convert to base64
                port.postMessage({ type: 'progress', message: `Fetching ${fileName} for alt text...`, originalSrcUrl: mediaSrcUrl });
                const response = await fetch(mediaSrcUrl);
                if (!response.ok) throw new Error(`Failed to fetch image ${fileName}: ${response.statusText}`);
                const blob = await response.blob();
                if (blob.size > SINGLE_FILE_DIRECT_LIMIT) {
                    port.postMessage({ type: 'warning', message: `Image ${fileName} is large (${(blob.size / (1024*1024)).toFixed(1)}MB), direct cloud processing might be slow or fail.`, originalSrcUrl: mediaSrcUrl });
                }
                const arrayBuffer = await blob.arrayBuffer();
                dataForCloud = {
                    base64Data: uint8ArrayToBase64(new Uint8Array(arrayBuffer)), // Helper needed
                    mimeType: blob.type || mediaType,
                    fileSize: blob.size
                };
            } else {
                throw new Error(`Unsupported media type for alt text: ${mediaType}`);
            }

            const requestPayload: RequestPayload = {
                base64Data: dataForCloud.base64Data,
                mimeType: dataForCloud.mimeType,
                fileName: fileName, // original filename
                fileSize: dataForCloud.fileSize,
                isChunk: false,
                chunkIndex: 0,
                totalChunks: 1,
                videoDuration: videoMetadata?.duration,
                videoWidth: videoMetadata?.width,
                videoHeight: videoMetadata?.height,
                action: isGeneratingCaptions ? 'generateCaptions' : undefined,
            };

            port.postMessage({ type: 'progress', message: `Sending ${fileName} to cloud for alt text...`, originalSrcUrl: mediaSrcUrl });
            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Cloud function error: ${response.status} ${errorText}`);
            }
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            
            port.postMessage({ type: 'altTextResult', altText: result.altText, originalSrcUrl: mediaSrcUrl });
        }
    } catch (error: any) {
        console.error(`[Background] Error in processMediaWithUrl for ${fileName} (URL: ${mediaSrcUrl}):`, error);
        port.postMessage({ type: 'error', message: `Processing failed for ${fileName}: ${error.message}`, originalSrcUrl: mediaSrcUrl, error: error.message });
    }
}

// Helper function: Uint8Array to Base64 (needed for dataForCloud)
function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return self.btoa(binary);
}
