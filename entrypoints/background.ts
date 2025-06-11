import browser from 'webextension-polyfill';
import { compressVideo, type CompressionSettings, type CompressionResult } from '../lib/video-processing';

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
const TOTAL_MEDIA_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB total for original media file
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

// New function to chunk large videos using FFmpeg
async function chunkVideoWithFFmpeg(mediaSrcUrl: string, fileName: string, mediaType: string, port: any): Promise<Array<{ base64Data: string; mimeType: string; fileSize: number; }> | null> {
    try {
        port.postMessage({ type: 'progress', message: `Getting video duration for chunking...`, originalSrcUrl: mediaSrcUrl });
        
        // First get the video duration
        const duration = await getMediaDurationViaFFmpeg(mediaSrcUrl, mediaType, fileName);
        if (duration <= 0) {
            throw new Error('Could not determine video duration for chunking');
        }

        console.log(`[chunkVideoWithFFmpeg] Video duration: ${duration}s`);
        
        // Calculate chunk parameters
        // Assume average bitrate and calculate segment duration to stay under limit
        // Since we don't have exact file size, use a conservative approach
        const maxSegmentDuration = Math.min(Math.max(duration / MAX_CHUNKS, 10), 60); // 10-60 seconds per chunk
        const numChunks = Math.min(Math.ceil(duration / maxSegmentDuration), MAX_CHUNKS);
        
        console.log(`[chunkVideoWithFFmpeg] Planning to create ${numChunks} chunks with ~${maxSegmentDuration}s each`);
        port.postMessage({ type: 'progress', message: `Creating ${numChunks} video chunks...`, originalSrcUrl: mediaSrcUrl });

        const chunks = [];
        for (let i = 0; i < numChunks; i++) {
            const startTime = i * maxSegmentDuration;
            const chunkDuration = Math.min(maxSegmentDuration, duration - startTime);
            
            if (chunkDuration <= 0.1) break; // Skip tiny chunks
            
            port.postMessage({ 
                type: 'progress', 
                message: `Processing chunk ${i + 1}/${numChunks} (${startTime.toFixed(1)}s - ${(startTime + chunkDuration).toFixed(1)}s)...`, 
                originalSrcUrl: mediaSrcUrl 
            });

            try {
                // Extract this chunk using FFmpeg
                const chunkFileName = `chunk_${i + 1}.mp4`;
                const chunkResult = await runFFmpegInOffscreen(
                    'extractChunk',
                    [
                        '-ss', startTime.toString(),
                        '-i', fileName,
                        '-t', chunkDuration.toString(),
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                        '-c:a', 'aac', '-b:a', '96k',
                        '-avoid_negative_ts', 'make_zero',
                        '-movflags', 'faststart',
                        chunkFileName
                    ],
                    { srcUrl: mediaSrcUrl, mediaType, fileName },
                    chunkFileName
                );

                if (chunkResult.success && chunkResult.data) {
                    const base64Data = uint8ArrayToBase64(new Uint8Array(chunkResult.data));
                    chunks.push({
                        base64Data: base64Data,
                        mimeType: 'video/mp4',
                        fileSize: chunkResult.data.byteLength
                    });
                    console.log(`[chunkVideoWithFFmpeg] Chunk ${i + 1} created: ${(chunkResult.data.byteLength / (1024 * 1024)).toFixed(1)}MB`);
                } else {
                    console.warn(`[chunkVideoWithFFmpeg] Failed to create chunk ${i + 1}`);
                    // Continue with other chunks instead of failing completely
                }
            } catch (chunkError: any) {
                console.warn(`[chunkVideoWithFFmpeg] Error creating chunk ${i + 1}: ${chunkError.message}`);
                // Continue with other chunks
            }
        }

        if (chunks.length === 0) {
            throw new Error('No video chunks were successfully created');
        }

        console.log(`[chunkVideoWithFFmpeg] Successfully created ${chunks.length} chunks`);
        return chunks;

    } catch (error: any) {
        console.error(`[chunkVideoWithFFmpeg] Failed to chunk video: ${error.message}`);
        return null;
    }
}

// Process media using the new compression approach
async function processMediaWithUrl(
    mediaSrcUrl: string,
    fileName: string,
    mediaType: string,
    generationType: 'altText' | 'captions',
    port: any,
    videoMetadata?: { duration?: number; width?: number; height?: number } | null
): Promise<void> {
    console.log(`[processMediaWithUrl] Processing ${fileName} (${mediaType}) for ${generationType} from URL: ${mediaSrcUrl}`);
    try {
        port.postMessage({ type: 'progress', message: `Processing ${fileName}...`, originalSrcUrl: mediaSrcUrl });

        // First, fetch the media file
        let blob: Blob;
        try {
            port.postMessage({ type: 'progress', message: `Fetching ${fileName}...`, originalSrcUrl: mediaSrcUrl });
            const response = await fetch(mediaSrcUrl);
            if (!response.ok) throw new Error(`Failed to fetch media: ${response.statusText}`);
            blob = await response.blob();
        } catch (error: any) {
            throw new Error(`Failed to fetch media: ${error.message}`);
        }

        // Check total file size limit
        if (blob.size > TOTAL_MEDIA_SIZE_LIMIT) {
            throw new Error(`File is too large (${(blob.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is ${TOTAL_MEDIA_SIZE_LIMIT / (1024 * 1024)}MB.`);
        }

        // Create File object for processing
        const file = new File([blob], fileName, { type: mediaType });
        
        const isGeneratingCaptions = generationType === 'captions';

        if (isGeneratingCaptions) {
            // For captions, we'll send the original file to the cloud function
            // The cloud function will handle caption generation using Gemini
            port.postMessage({ type: 'progress', message: `Generating captions for ${fileName}...`, originalSrcUrl: mediaSrcUrl });
            
            const base64Data = await blobToBase64(blob);
            const requestPayload = {
                base64Data: base64Data,
                mimeType: blob.type || mediaType,
                fileName: fileName,
                fileSize: blob.size,
                action: 'generateCaptions',
                duration: videoMetadata?.duration,
                isVideo: true,
                videoDuration: videoMetadata?.duration,
                videoWidth: videoMetadata?.width,
                videoHeight: videoMetadata?.height,
            };

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
            
            if (result.vttContent) {
                port.postMessage({ 
                    type: 'captionResult', 
                    vttResults: [{ fileName: fileName + '.vtt', vttContent: result.vttContent }], 
                    originalSrcUrl: mediaSrcUrl 
                });
            } else {
                throw new Error('No VTT content received from cloud function');
            }
        } else if (generationType === 'altText') {
            // For alt text, determine if we need compression
            const isVideo = mediaType.startsWith('video/') || mediaType === 'image/gif' || mediaType === 'image/webp' || mediaType === 'image/apng';
            const isLargeFile = blob.size > SINGLE_FILE_DIRECT_LIMIT;
            
            console.log(`[processMediaWithUrl] File size: ${(blob.size / (1024 * 1024)).toFixed(1)}MB, isVideo: ${isVideo}, needsCompression: ${isLargeFile}`);
            
            let processedBlob = blob;
            let processedFileName = fileName;

            // If we need compression, use our new compression functionality
            if (isLargeFile && isVideo) {
                port.postMessage({ type: 'progress', message: `Compressing ${fileName} for processing...`, originalSrcUrl: mediaSrcUrl });
                
                try {
                    // Use VP9 for best compression on large files
                    const compressionSettings: CompressionSettings = {
                        codec: 'libvpx-vp9',
                        quality: 'medium',
                        maxSizeMB: SINGLE_FILE_DIRECT_LIMIT / (1024 * 1024)
                    };
                    
                    let compressionResult: CompressionResult | null = null;
                    
                    // Try to use offscreen document first if available
                    if (await hasOffscreenDocument()) {
                        try {
                            const fileArrayBuffer = await file.arrayBuffer();
                            const response = await browser.runtime.sendMessage({
                                target: 'offscreen-ffmpeg',
                                type: 'compressVideo',
                                payload: {
                                    fileData: fileArrayBuffer,
                                    fileName: fileName,
                                    mimeType: mediaType,
                                    compressionSettings: compressionSettings
                                }
                            });
                            
                            if (response && response.success) {
                                const compressedBlob = new Blob([response.data], { type: 'video/webm' });
                                compressionResult = {
                                    blob: compressedBlob,
                                    originalSize: response.originalSize,
                                    compressedSize: response.compressedSize,
                                    compressionRatio: response.compressionRatio,
                                    codec: response.codec,
                                    quality: response.quality
                                };
                            } else {
                                console.warn('[Background] Offscreen compression failed:', response?.error);
                            }
                        } catch (offscreenError: any) {
                            console.warn('[Background] Offscreen compression error:', offscreenError.message);
                        }
                    }
                    
                    // Fallback to direct compression if offscreen failed
                    if (!compressionResult) {
                        compressionResult = await compressVideo(file, compressionSettings);
                    }
                    
                    if (compressionResult) {
                        processedBlob = compressionResult.blob;
                        processedFileName = `compressed_${fileName.split('.')[0]}.webm`;
                        
                        const compressionRatio = ((1 - compressionResult.compressedSize / compressionResult.originalSize) * 100).toFixed(1);
                        port.postMessage({ 
                            type: 'progress', 
                            message: `Compressed ${fileName} by ${compressionRatio}% (${(compressionResult.originalSize / (1024 * 1024)).toFixed(1)}MB → ${(compressionResult.compressedSize / (1024 * 1024)).toFixed(1)}MB)`, 
                            originalSrcUrl: mediaSrcUrl 
                        });
                        
                        console.log(`[processMediaWithUrl] Successfully compressed ${fileName}: ${(compressionResult.originalSize / (1024 * 1024)).toFixed(1)}MB → ${(compressionResult.compressedSize / (1024 * 1024)).toFixed(1)}MB`);
                    } else {
                        throw new Error('Compression failed - no result returned');
                    }
                } catch (compressionError: any) {
                    console.warn(`[processMediaWithUrl] Compression failed for ${fileName}:`, compressionError.message);
                    port.postMessage({ type: 'warning', message: `Compression failed, processing original file...`, originalSrcUrl: mediaSrcUrl });
                    // Continue with original file
                }
            }
            
            // Process the file (either original or compressed) for alt text
            const processingType = isVideo ? 'video/media' : 'image';
            const sizeMsg = ` (${(processedBlob.size / (1024 * 1024)).toFixed(1)}MB)`;
            
            port.postMessage({ type: 'progress', message: `Processing ${processedFileName}${sizeMsg} for alt text...`, originalSrcUrl: mediaSrcUrl });
            
            if (processedBlob.size > SINGLE_FILE_DIRECT_LIMIT) {
                port.postMessage({ type: 'warning', message: `${processingType} ${processedFileName} is still large${sizeMsg}, processing might be slow.`, originalSrcUrl: mediaSrcUrl });
            }
            
            const base64Data = await blobToBase64(processedBlob);
            const requestPayload: RequestPayload = {
                base64Data: base64Data,
                mimeType: processedBlob.type || mediaType,
                fileName: processedFileName,
                fileSize: processedBlob.size,
                isChunk: false,
                chunkIndex: 0,
                totalChunks: 1,
                isVideo: isVideo,
                videoDuration: videoMetadata?.duration,
                videoWidth: videoMetadata?.width,
                videoHeight: videoMetadata?.height,
            };

            port.postMessage({ type: 'progress', message: `Sending ${processedFileName} to cloud for alt text...`, originalSrcUrl: mediaSrcUrl });
            const finalResponse = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload),
            });

            if (!finalResponse.ok) {
                const errorText = await finalResponse.text();
                throw new Error(`Cloud function error: ${finalResponse.status} ${errorText}`);
            }
            const result = await finalResponse.json();
            if (result.error) throw new Error(result.error);
            
            port.postMessage({ type: 'altTextResult', altText: result.altText, originalSrcUrl: mediaSrcUrl });
        }
    } catch (error: any) {
        console.error(`[Background] Error in processMediaWithUrl for ${fileName} (URL: ${mediaSrcUrl}):`, error);
        port.postMessage({ type: 'error', message: `Processing failed for ${fileName}: ${error.message}`, originalSrcUrl: mediaSrcUrl, error: error.message });
    }
}

// Helper function: Blob to Base64
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Extract the base64 part without the prefix
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(blob);
    });
}

// Helper function: Uint8Array to Base64 (backup)
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

        // Start loading offscreen document for video compression
        console.log('[Background] Setting up offscreen document for video compression...');
        setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH).catch((err: Error) => {
            console.warn("[Background] Initial offscreen document setup failed:", err.message);
        });

        // Listener for long-lived port connections from content scripts
        browser.runtime.onConnect.addListener((port: any) => {
            if (port.name === 'content-script-port') {
                if (contentScriptPort && contentScriptPort !== port) {
                    console.log('[Background] New content script connection, previous port will be replaced.');
                }
                contentScriptPort = port;
                console.log('[Background] Content script connected via port:', port.sender?.tab?.id ? `Tab ID ${port.sender.tab.id}` : 'Unknown tab');

                // Send ready status to content script
                if (contentScriptPort && contentScriptPort === port) { 
                    contentScriptPort.postMessage({ 
                        type: 'ffmpegStatus', 
                        status: 'Video compression ready', 
                        error: false
                    });
                }

                // Ensure offscreen document is set up when content script connects
                setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH).catch((err: Error) => {
                    console.warn("[Background] Offscreen document setup failed on connection:", err.message);
                    if (contentScriptPort && contentScriptPort === port) { 
                        contentScriptPort.postMessage({ 
                            type: 'ffmpegStatus', 
                            status: 'Video compression setup error: ' + err.message, 
                            error: true
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
            const senderInfo = sender.tab?.id ? `Tab ID ${sender.tab.id}` : 
                              sender.url?.includes('offscreen.html') ? 'Offscreen Document' : 
                              'Unknown Context';
            
            // Only log important messages to reduce noise
            if (message.type !== 'ffmpegLogOffscreen' || message.payload?.type === 'error') {
                console.log('[Background] Received runtime message:', message.type, 'from:', senderInfo);
            }
            
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
                    
                    // Send processing status
                    contentScriptPort.postMessage({ 
                        type: 'ffmpegStatus', 
                        status: 'Processing media...', 
                        loading: true
                    });
                    
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
            
            // Handle offscreen FFmpeg status messages
            if (message.type === 'ffmpegStatusOffscreen') {
                console.log('[Background] Received offscreen FFmpeg status:', message.payload);
                if (contentScriptPort) {
                    contentScriptPort.postMessage({
                        type: 'ffmpegStatus',
                        status: message.payload.progress === 'complete' ? 'Video compression ready' : 
                               message.payload.progress === 'error' ? `Error: ${message.payload.error}` : 
                               'Video compression loading...',
                        error: message.payload.progress === 'error',
                        loading: message.payload.progress !== 'complete' && message.payload.progress !== 'error'
                    });
                }
            }
            
            // Return undefined for messages we don't handle
            return undefined;
        });
        console.log('[Background] onMessage listener attached.');
    },
};

console.log('[Background] Background script loaded (listeners will be set up in main when service worker executes).');
