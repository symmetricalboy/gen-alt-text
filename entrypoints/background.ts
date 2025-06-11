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
let ffmpegReady = false; // Track if FFmpeg is loaded

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

// --- FFmpeg Input type definition ---
interface FFmpegInput {
    srcUrl: string;
    mediaType: string;
    fileName: string;
}

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
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'; // Removed leading slash

let ffmpegOperations = new Map<number, { resolve: (value?: any) => void; reject: (reason?: any) => void }>();
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
        documentUrls: [browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return contexts ? contexts.length > 0 : false;
}

// Helper function to check if offscreen document is active
async function offscreenDocumentIsActive(): Promise<boolean> {
    return await hasOffscreenDocument();
}

async function setupOffscreenDocument(path: string) {
    try {
        const docExists = await hasOffscreenDocument();
        if (!docExists) {
            console.log('[Background] Creating offscreen document...');
            // Use any to bypass type checking for createDocument
            await (browser as any).offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [(browser as any).offscreen.Reason.BLOBS, (browser as any).offscreen.Reason.USER_MEDIA],
                justification: 'FFmpeg processing for media files.',
            });
            console.log('[Background] Offscreen document requested for creation.');
        } else {
            console.log('[Background] Offscreen document already exists. Assuming FFmpeg ready or will be handled.');
            // Potentially verify readiness or re-trigger load if necessary, but for now assume ready
            return; 
        }

        // Wait for the offscreen document to be created
        await new Promise<void>(resolve => {
            const timeoutId = setTimeout(() => {
                console.warn('[Background] Timeout waiting for offscreen document to load FFmpeg.');
                browser.runtime.onMessage.removeListener(initialLoadListener);
                ffmpegReady = false; // Ensure this is false on timeout
                resolve();
            }, 300000); // 5 minute timeout to match offscreen handler
            
            const initialLoadListener = (message: any, sender: any) => {
                if (sender.url && sender.url.endsWith(OFFSCREEN_DOCUMENT_PATH) && message.type === 'ffmpegStatusOffscreen') {
                    if (message.payload?.progress === 'scripts-loaded') {
                        console.log('[Background] Offscreen scripts loaded. The offscreen script will now load FFmpeg automatically.');
                    } else if (message.payload?.progress === 'complete') {
                        console.log('[Background] Offscreen reports FFmpeg is loaded and ready.');
                        ffmpegReady = true;
                        browser.runtime.onMessage.removeListener(initialLoadListener);
                        clearTimeout(timeoutId);
                        resolve();
                    } else if (message.payload?.progress === 'error') {
                        console.error('[Background] Offscreen reports FFmpeg load failed:', message.payload.error);
                        browser.runtime.onMessage.removeListener(initialLoadListener);
                        clearTimeout(timeoutId);
                        resolve(); // Resolve anyway to not block, but ffmpegReady is false
                    }
                }
            };
            browser.runtime.onMessage.addListener(initialLoadListener);
        });
    } catch (error) {
        console.error('[Background] Error setting up offscreen document:', error);
    }
}

// Re-implement runFFmpegInOffscreen to be simpler
async function runFFmpegInOffscreen(operationName: string, command: string | string[], input: FFmpegInput, outputFileName: string): Promise<any> {
    console.log(`[runFFmpegInOffscreen] Operation: ${operationName}. Input:`, input);

    if (!(await offscreenDocumentIsActive())) {
        await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    }
    
    // Check if FFmpeg is ready
    if (!ffmpegReady) {
        console.log('[runFFmpegInOffscreen] FFmpeg not ready yet, waiting for it to load...');
        // If FFmpeg is not ready, we need to wait for it
        // This could happen if a request comes in while FFmpeg is still loading
        const maxWaitTime = 300000; // 5 minutes
        const startTime = Date.now();
        
        while (!ffmpegReady && (Date.now() - startTime) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
        }
        
        if (!ffmpegReady) {
            throw new Error('FFmpeg failed to load after 5 minutes');
        }
    }
    
    // Send the command and wait for a direct response.
    try {
        const response = await browser.runtime.sendMessage({
            target: 'offscreen-ffmpeg',
            type: 'runFFmpeg',
            payload: {
                operationId: ++operationIdCounter, // Keep for logging on offscreen side
                command,
                ...input,
                outputFileName
            }
        });

        if (response) {
            if (response.success) {
                console.log(`[runFFmpegInOffscreen] FFmpeg operation ${operationName} successful.`);
                return response; // The response object is now the result, e.g., { success: true, data, fileName }
            } else {
                throw new Error(response.error || `Unknown FFmpeg error for ${operationName}.`);
            }
        } else {
            // This can happen if the offscreen document is closed unexpectedly.
            throw new Error('No response from offscreen document.');
        }
    } catch (err: any) {
        console.error(`[runFFmpegInOffscreen] Error during FFmpeg operation '${operationName}':`, err);
        // Re-throw the error to be caught by the caller (e.g., processMediaWithUrl)
        throw new Error(`Failed to execute FFmpeg command for ${operationName}: ${err.message}`);
    }
}

async function getMediaDurationViaFFmpeg(mediaSrcUrl: string, mediaType: string, fileName: string): Promise<number> {
    console.log('[getMediaDurationViaFFmpeg] for URL:', mediaSrcUrl);
    const result = await runFFmpegInOffscreen(
        'getDuration',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fileName],
        {srcUrl: mediaSrcUrl, mediaType, fileName},
        'duration.txt'
    );
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
            const vttResult = await runFFmpegInOffscreen(
                'generateVTT',
                ['-i', fileName, '-an', '-vn', '-scodec', 'webvtt', '-f', 'vtt', 'output.vtt'],
                {srcUrl: mediaSrcUrl, mediaType, fileName},
                'output.vtt'
            );
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

            // Check if this is a GIF or other simple media that can be sent directly to cloud
            const isSimpleMedia = mediaType === 'image/gif' || mediaType.startsWith('image/');
            
            if ((mediaType.startsWith('video/') || mediaType === 'image/gif') && !isSimpleMedia) { 
                // Complex video processing - needs FFmpeg for frame extraction
                port.postMessage({ type: 'progress', message: `Extracting frame from ${fileName} for alt text...`, originalSrcUrl: mediaSrcUrl });
                try {
                    const frameResult = await runFFmpegInOffscreen(
                        'extractFrame',
                        ['-i', fileName, '-vf', 'select=eq(n\,0)', '-q:v', '3', 'frame.jpg', '-f', 'image2'],
                        { srcUrl: mediaSrcUrl, mediaType, fileName },
                        'frame.jpg'
                    );
                    if (frameResult.success && frameResult.data) {
                        const imageBase64 = uint8ArrayToBase64(new Uint8Array(frameResult.data));
                        dataForCloud = {
                            base64Data: imageBase64,
                            mimeType: 'image/jpeg', // Output of FFmpeg command
                            fileSize: frameResult.data.byteLength
                        };
                    } else {
                        throw new Error('FFmpeg failed to extract frame for alt text.');
                    }
                } catch (ffmpegError: any) {
                    console.warn(`[processMediaWithUrl] FFmpeg failed for ${fileName}, trying fallback approach:`, ffmpegError.message);

                    // Fallback: treat as simple media and send directly to cloud
                    port.postMessage({ type: 'progress', message: `FFmpeg failed, sending ${fileName} directly to cloud for alt text...`, originalSrcUrl: mediaSrcUrl });
                    const response = await fetch(mediaSrcUrl);
                    if (!response.ok) throw new Error(`Failed to fetch ${fileName}: ${response.statusText}`);
                    const blob = await response.blob();
                    if (blob.size > SINGLE_FILE_DIRECT_LIMIT) {
                        port.postMessage({ type: 'warning', message: `Media ${fileName} is large (${(blob.size / (1024 * 1024)).toFixed(1)}MB), direct cloud processing might be slow or fail.`, originalSrcUrl: mediaSrcUrl });
                    }
                    const arrayBuffer = await blob.arrayBuffer();
                    dataForCloud = {
                        base64Data: uint8ArrayToBase64(new Uint8Array(arrayBuffer)),
                        mimeType: blob.type || mediaType,
                        fileSize: blob.size
                    };
                }
            } else if (mediaType.startsWith('image/')) {
                // Direct image processing - fetch and convert to base64
                port.postMessage({ type: 'progress', message: `Fetching ${fileName} for alt text...`, originalSrcUrl: mediaSrcUrl });
                const response = await fetch(mediaSrcUrl);
                if (!response.ok) throw new Error(`Failed to fetch image ${fileName}: ${response.statusText}`);
                const blob = await response.blob();
                if (blob.size > SINGLE_FILE_DIRECT_LIMIT) {
                    port.postMessage({ type: 'warning', message: `Image ${fileName} is large (${(blob.size / (1024 * 1024)).toFixed(1)}MB), direct cloud processing might be slow or fail.`, originalSrcUrl: mediaSrcUrl });
                }
                const arrayBuffer = await blob.arrayBuffer();
                dataForCloud = {
                    base64Data: uint8ArrayToBase64(new Uint8Array(arrayBuffer)),
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

// WXT entry point
export default {
    main() {
        console.log('[Background] Service worker main() executed. Setting up listeners.');

        // Start loading FFmpeg right away when the extension starts
        console.log('[Background] Preloading FFmpeg on browser start...');
        setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH).catch((err: Error) => {
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

                // When a port connects, ensure FFmpeg is loading/loaded but don't block
                setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH).catch((err: Error) => {
                    console.warn("[Background] Offscreen Document setup/FFmpeg load failed:", err.message);
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
        
        // Add listener for runtime messages (e.g., from content script sendMessage)
        browser.runtime.onMessage.addListener(async (message: any, sender: any) => {
            console.log('[Background] Received runtime message:', message.type, 'from:', sender.tab?.id);
            
            if (message.type === 'processLargeMediaViaSendMessage') {
                // Handle media processing request from content script
                const payload = message.payload;
                if (!payload) {
                    return { error: 'No payload provided' };
                }
                
                try {
                    // Get the content script port for sending progress updates
                    if (!contentScriptPort) {
                        console.error('[Background] No content script port available for sending updates');
                        return { error: 'No active connection to content script' };
                    }
                    
                    // Check if FFmpeg is ready
                    if (!ffmpegReady) {
                        contentScriptPort.postMessage({ 
                            type: 'ffmpegStatus', 
                            status: 'FFmpeg is still loading, please wait...', 
                            loading: true,
                            firstLoadMessage: 'FFmpeg is loading. The first load can take up to 5 minutes. Future loads will be faster.'
                        });
                    }
                    
                    // Process the media using the URL
                    await processMediaWithUrl(
                        payload.mediaSrcUrl,
                        payload.fileName,
                        payload.mediaType,
                        payload.generationType,
                        contentScriptPort,
                        payload.videoMetadata
                    );
                    
                    return { success: true };
                } catch (error: any) {
                    console.error('[Background] Error processing media:', error);
                    return { error: error.message };
                }
            }
            
            // Return undefined for messages we don't handle
            return undefined;
        });
        console.log('[Background] onMessage listener attached.');
    },
};

console.log('[Background] Background script loaded (listeners will be set up in main when service worker executes).');
