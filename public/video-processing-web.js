// video-processing-web.js - Standalone FFmpeg video processing for browser extensions (v0.11.x compatible)
// This is designed to work with FFmpeg.wasm v0.11.x for Chrome extension MV3 compatibility

// Create a namespace to avoid global pollution
const VideoProcessing = (function() {
    // Private variables
    let ffmpeg = null;
    let isFFmpegLoaded = false;
    let ffmpegLoadPromise = null;
    const MAX_SIZE_MB = 20; // Files larger than this will get stronger compression
    
    // Define allowed video codecs and quality settings
    const VideoCodec = {
        H264: 'libx264',
        VP8: 'libvpx',
        VP9: 'libvpx-vp9'
    };
    
    const VideoQuality = {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high'
    };
    
    // Try to find fetchFile in various scopes - helps with different FFmpeg.wasm versions
    function findFetchFile() {
        // Check in global scope
        if (typeof fetchFile === 'function') {
            console.log('[VideoProcessing] Using global fetchFile');
            return fetchFile;
        }
        
        // Check in self/window scope
        if (typeof self !== 'undefined' && typeof self.fetchFile === 'function') {
            console.log('[VideoProcessing] Using self.fetchFile');
            return self.fetchFile;
        }
        
        if (typeof window !== 'undefined' && typeof window.fetchFile === 'function') {
            console.log('[VideoProcessing] Using window.fetchFile');
            return window.fetchFile;
        }
        
        // If fetchFile isn't available anywhere, create a simple implementation
        console.log('[VideoProcessing] Creating fallback fetchFile implementation');
        return async function(file) {
            // If it's already a Uint8Array, return as is
            if (file instanceof Uint8Array) {
                return file;
            }
            
            // If it's a blob or file, convert to Uint8Array
            if (file instanceof Blob || file instanceof File) {
                const arrayBuffer = await file.arrayBuffer();
                return new Uint8Array(arrayBuffer);
            }
            
            // If it's a string URL, fetch it
            if (typeof file === 'string') {
                const response = await fetch(file);
                const arrayBuffer = await response.arrayBuffer();
                return new Uint8Array(arrayBuffer);
            }
            
            throw new Error('Unsupported input type for fetchFile');
        };
    }
    
    /**
     * Detects the runtime environment and returns appropriate core URL
     */
    function getFFmpegCoreURL() {
        // Check if we're in a browser extension context
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            console.log('[VideoProcessing] Using Chrome extension URL for FFmpeg core');
            return chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
        }
        
        // Check if we're in a web context
        if (typeof window !== 'undefined' && window.location) {
            console.log('[VideoProcessing] Using dynamic window.location.origin for FFmpeg core');
            return `${window.location.origin}/assets/ffmpeg/ffmpeg-core.js`;
        }
        
        // Fallback
        console.log('[VideoProcessing] Using fallback CDN URL for FFmpeg core');
        return "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";
    }
    
    /**
     * Finds and returns the appropriate createFFmpeg function
     */
    function findCreateFFmpeg() {
        // For FFmpeg v0.11.x, check in various places
        
        // Check in self.FFmpeg (most likely for v0.11.x)
        if (typeof self.FFmpeg === 'object' && self.FFmpeg !== null && typeof self.FFmpeg.createFFmpeg === 'function') {
            console.log('[VideoProcessing] Using self.FFmpeg.createFFmpeg');
            return self.FFmpeg.createFFmpeg;
        }
        
        // Check in self global scope
        if (typeof self.createFFmpeg === 'function') {
            console.log('[VideoProcessing] Using self.createFFmpeg');
            return self.createFFmpeg;
        }
        
        // Check in window scope
        if (typeof window !== 'undefined' && typeof window.createFFmpeg === 'function') {
            console.log('[VideoProcessing] Using window.createFFmpeg');
            return window.createFFmpeg;
        }
        
        // Check in global scope
        if (typeof createFFmpeg === 'function') {
            console.log('[VideoProcessing] Using global createFFmpeg');
            return createFFmpeg;
        }
        
        console.error('[VideoProcessing] Failed to find createFFmpeg function');
        throw new Error('Could not find createFFmpeg function. Make sure FFmpeg.wasm v0.11.x is loaded.');
    }
    
    /**
     * Initializes and loads the FFmpeg instance.
     */
    async function initFFmpeg() {
        if (isFFmpegLoaded && ffmpeg) {
            console.log('[VideoProcessing] FFmpeg already loaded.');
            return ffmpeg;
        }
        
        if (ffmpegLoadPromise) {
            console.log('[VideoProcessing] FFmpeg load already in progress, awaiting completion...');
            return ffmpegLoadPromise;
        }
        
        console.log('[VideoProcessing] Initializing FFmpeg...');
        
        ffmpegLoadPromise = new Promise(async (resolve, reject) => {
            try {
                const createFFmpegFunc = findCreateFFmpeg();
                const fetchFileFunc = findFetchFile();
                
                // For Chrome MV3 extensions, we need to disable threading
                // and specify the paths to avoid CSP issues with blob: URLs
                ffmpeg = createFFmpegFunc({
                    log: true,
                    corePath: getFFmpegCoreURL(),
                    // Disable threading for Chrome MV3 compatibility
                    mainName: 'main',
                    mt: false,
                    
                    // Use locateFile to resolve paths correctly within extension
                    locateFile: (path, scriptDirectory) => {
                        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                            if (path === 'ffmpeg-core.wasm') {
                                return chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm');
                            }
                            if (path === 'ffmpeg-core.js') {
                                return chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
                            }
                            if (path.includes('ffmpeg-core.worker.js')) {
                                // For Chrome MV3, we disable workers
                                console.log('[VideoProcessing] Disabled worker for Chrome MV3 compatibility');
                                return null;
                            }
                        }
                        
                        // Fallback to default
                        return scriptDirectory + path;
                    }
                });
                
                // Set up logging to suppress verbose logs in production
                ffmpeg.setLogger(({ type, message }) => {
                    if (type === 'fferr') {
                        console.error(`[FFmpeg Error]: ${message}`);
                    } else if (message.includes('error') || message.includes('failed')) {
                        console.warn(`[FFmpeg Warning]: ${message}`);
                    } else {
                        // Uncomment for debugging
                        // console.log(`[FFmpeg]: ${message}`);
                    }
                });
                
                // Add progress handler
                ffmpeg.setProgress(({ ratio }) => {
                    if (ratio !== undefined && ratio >= 0) {
                        console.log(`[FFmpeg] Progress: ${(ratio * 100).toFixed(2)}%`);
                    }
                });
                
                console.log('[VideoProcessing] Loading FFmpeg...');
                await ffmpeg.load();
                console.log('[VideoProcessing] FFmpeg loaded successfully!');
                
                // Store important functions for later use
                ffmpeg.fetchFile = fetchFileFunc;
                
                isFFmpegLoaded = true;
                resolve(ffmpeg);
            } catch (error) {
                console.error('[VideoProcessing] Failed to load FFmpeg:', error);
                ffmpegLoadPromise = null;
                reject(error);
            }
        });
        
        return ffmpegLoadPromise;
    }
    
    /**
     * Gets codec parameters based on codec type and quality settings
     */
    function getCodecParams(codec, quality, stronger = false) {
        let ext = 'mp4';
        let params = [];
        
        const qualityMap = { 'low': 0, 'medium': 1, 'high': 2 };
        
        const h264_crf = [30, 26, 22]; // Low, Medium, High
        const vp8_crf = [35, 30, 25];
        const vp9_crf = [40, 35, 30];
        
        let crf_value;
        let qualityIndex = qualityMap[quality];
        
        switch(codec) {
            case VideoCodec.VP8: // VP8
                ext = 'webm';
                crf_value = vp8_crf[qualityIndex] || vp8_crf[1];
                if (stronger) crf_value += 5;
                params.push('-c:v', 'libvpx', '-crf', crf_value.toString(), '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8');
                break;
            case VideoCodec.VP9: // VP9
                ext = 'webm';
                crf_value = vp9_crf[qualityIndex] || vp9_crf[1];
                if (stronger) crf_value += 5;
                params.push('-c:v', 'libvpx-vp9', '-crf', crf_value.toString(), '-b:v', '0', '-deadline', 'realtime', '-row-mt', '1');
                break;
            default: // H.264
                ext = 'mp4';
                crf_value = h264_crf[qualityIndex] || h264_crf[1];
                if (stronger) crf_value += 4;
                params.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf_value.toString());
                // Explicitly set format for H.264 to prevent misdetection as subtitle
                params.push('-f', 'mp4');
                break;
        }
        
        // Add audio codec settings
        params.push('-c:a', 'aac', '-b:a', '128k');
        
        // Add scaling filter to ensure dimensions are even (required for H.264)
        params.push('-vf', 'scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2');
        
        // Thread limiting to avoid pthread errors in WebAssembly
        params.push('-threads', '1');
        
        if (codec === VideoCodec.H264) {
            params.push('-x264-params', 'threads=1:sliced-threads=0');
        }
        
        // For large files, cap the framerate
        if (stronger) {
            // Add -r 30 before the output to ensure output fps is capped
            params.push('-r', '30');
        }
        
        return { ext, params };
    }
    
    /**
     * Compresses a video file using FFmpeg with specified settings
     * @param videoFile The video file to compress
     * @param settings Compression settings (codec, quality, maxSize)
     * @param progressCallback Callback for progress updates
     * @returns Promise resolving to compression result
     */
    async function compressVideo(
        videoFile,
        settings = {},
        progressCallback
    ) {
        const {
            codec = VideoCodec.H264,
            quality = VideoQuality.MEDIUM,
            maxSizeMB = MAX_SIZE_MB
        } = settings;
        
        const log = (message) => {
            console.log(`[VideoProcessing]: ${message}`);
            if (typeof progressCallback === 'function') {
                progressCallback(message);
            }
        };
        
        log('Initializing FFmpeg...');
        const ffmpegInstance = await initFFmpeg();
        const fetchFile = ffmpegInstance.fetchFile || findFetchFile();
        
        const inputFileName = videoFile.name || 'input.mp4';
        const originalSize = videoFile.size;
        const originalSizeMB = originalSize / (1024 * 1024);
        log(`Original file size: ${originalSizeMB.toFixed(2)} MB`);
        
        // Determine if we need stronger compression
        const needsStrongerCompression = originalSizeMB > maxSizeMB * 1.5;
        
        try {
            log('Loading video file into FFmpeg...');
            ffmpegInstance.FS('writeFile', inputFileName, await fetchFile(videoFile));
            
            // First pass - initial compression
            log(`Starting compression with codec: ${codec}, quality: ${quality}`);
            const { ext, params } = getCodecParams(codec, quality, needsStrongerCompression);
            const outputFileName = `compressed.${ext}`;
            
            // Log the full command for debugging
            const fullCommand = ['-i', inputFileName, ...params, outputFileName];
            log(`Running FFmpeg command: ffmpeg ${fullCommand.join(' ')}`);
            
            // Execute FFmpeg
            await ffmpegInstance.run(...fullCommand);
            
            // Read the result
            log('Reading compressed file...');
            let data;
            try {
                data = ffmpegInstance.FS('readFile', outputFileName);
            } catch (e) {
                log(`Error reading output file: ${e.message}`);
                throw new Error(`Failed to read compressed file: ${e.message}`);
            }
            
            let compressedSize = data.buffer.byteLength;
            log(`Initial compression complete. Size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
            
            // Second pass if file is still too large
            if (compressedSize > maxSizeMB * 1024 * 1024) {
                log(`File still larger than ${maxSizeMB}MB. Applying stronger compression...`);
                
                // Clean up first pass file
                try {
                    ffmpegInstance.FS('unlink', outputFileName);
                } catch (e) {
                    log(`Warning: Failed to clean up first pass file: ${e.message}`);
                }
                
                const { ext: strongerExt, params: strongerParams } = getCodecParams(codec, quality === VideoQuality.LOW ? VideoQuality.LOW : VideoQuality.LOW, true);
                const strongerOutputFileName = `compressed_stronger.${strongerExt}`;
                
                // Add even more aggressive settings for really large files
                let finalParams = [...strongerParams];
                
                if (originalSizeMB > 50) {
                    log('File extremely large, using maximum compression settings');
                    // If it's H.264, use ultrafast preset with higher CRF
                    if (codec === VideoCodec.H264) {
                        // Replace 'veryfast' with 'ultrafast'
                        const presetIndex = finalParams.indexOf('veryfast');
                        if (presetIndex !== -1) {
                            finalParams[presetIndex] = 'ultrafast';
                        }
                        
                        // Find and increase CRF
                        const crfIndex = finalParams.indexOf('-crf');
                        if (crfIndex !== -1 && crfIndex + 1 < finalParams.length) {
                            finalParams[crfIndex + 1] = '30'; // Higher CRF = lower quality
                        }
                        
                        // Add additional scaling to reduce resolution if needed
                        finalParams.push('-vf', 'scale=\'min(1280,iw)\':\'min(720,ih)\':force_original_aspect_ratio=decrease');
                    }
                    // For VP8/VP9, use lower quality settings
                    else {
                        // Find and increase CRF for VP8/VP9
                        const crfIndex = finalParams.indexOf('-crf');
                        if (crfIndex !== -1 && crfIndex + 1 < finalParams.length) {
                            const currentCrf = parseInt(finalParams[crfIndex + 1]);
                            finalParams[crfIndex + 1] = (currentCrf + 5).toString(); // Higher CRF
                        }
                    }
                    
                    // Force framerate reduction for all codecs
                    finalParams.push('-r', '30');
                }
                
                // Log the full command for second pass
                const fullSecondCommand = ['-i', inputFileName, ...finalParams, strongerOutputFileName];
                log(`Running stronger compression: ffmpeg ${fullSecondCommand.join(' ')}`);
                
                // Run the second pass
                await ffmpegInstance.run(...fullSecondCommand);
                
                // Read the second pass result
                try {
                    data = ffmpegInstance.FS('readFile', strongerOutputFileName);
                } catch (e) {
                    log(`Error reading second pass output: ${e.message}`);
                    throw new Error(`Failed to read second pass file: ${e.message}`);
                }
                
                compressedSize = data.buffer.byteLength;
                log(`Stronger compression complete. Final size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
                
                // Clean up stronger compression file
                try {
                    ffmpegInstance.FS('unlink', strongerOutputFileName);
                } catch (e) {
                    log(`Warning: Failed to clean up second pass file: ${e.message}`);
                }
            } else {
                // Clean up initial compression file
                try {
                    ffmpegInstance.FS('unlink', outputFileName);
                } catch (e) {
                    log(`Warning: Failed to clean up output file: ${e.message}`);
                }
            }
            
            // Create result blob with appropriate MIME type
            const mimeType = ext === 'webm' ? 'video/webm' : 'video/mp4';
            const blob = new Blob([data.buffer], { type: mimeType });
            
            const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
            
            log(`Compression complete! Reduced from ${(originalSize / 1024 / 1024).toFixed(2)}MB to ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio.toFixed(1)}% reduction)`);
            
            return {
                blob,
                originalSize,
                compressedSize,
                compressionRatio,
                codec,
                quality
            };
            
        } catch (error) {
            log(`Compression failed: ${error.message}`);
            console.error('[VideoProcessing] Error stack:', error.stack);
            throw new Error(`Video compression failed: ${error.message}`);
        } finally {
            // Clean up input file
            try {
                ffmpegInstance.FS('unlink', inputFileName);
            } catch (e) {
                // Ignore if file doesn't exist
                log(`Note: Could not clean up input file: ${e.message}`);
            }
        }
    }
    
    /**
     * Legacy function for backward compatibility - processes video into chunks
     * @deprecated Use compressVideo instead for single file compression
     */
    async function processVideoIntoChunks(videoFile, progressCallback) {
        console.warn('[VideoProcessing] processVideoIntoChunks is deprecated. Use compressVideo for single file compression.');
        
        const result = await compressVideo(videoFile, {
            codec: VideoCodec.H264,
            quality: VideoQuality.MEDIUM
        }, progressCallback);
        
        return [result.blob];
    }
    
    // Public API
    return {
        // Constants
        VideoCodec,
        VideoQuality,
        
        // Core functions
        initFFmpeg,
        compressVideo,
        processVideoIntoChunks,
        
        // Utility functions
        getFFmpegCoreURL,
        findFetchFile
    };
})();

// For CommonJS/AMD/UMD compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoProcessing;
} else if (typeof define === 'function' && define.amd) {
    define(function() { return VideoProcessing; });
}

// For global use
if (typeof self !== 'undefined') {
    self.VideoProcessing = VideoProcessing;
}
if (typeof window !== 'undefined') {
    window.VideoProcessing = VideoProcessing;
} 