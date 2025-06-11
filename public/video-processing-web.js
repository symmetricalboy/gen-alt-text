// public/video-processing-web.js
// Standalone video processing library for web clients

(function(global) {
    'use strict';

    // Configuration based on environment
    const getFFmpegConfig = () => {
        // Check if we're in a browser extension context
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            return {
                coreURL: chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.js'),
                wasmURL: chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.wasm'),
                version: 'v0.11.x'
            };
        }
        
        // Web client - use local assets instead of CDN
        // This ensures we use the same v0.11.x version that the extension uses
        return {
            coreURL: "/assets/ffmpeg/ffmpeg-core.js",
            wasmURL: "/assets/ffmpeg/ffmpeg-core.wasm",
            version: 'v0.11.x'
        };
    };

    let ffmpeg = null;
    let isFFmpegLoaded = false;
    const MAX_SIZE_MB = 20;

    // Codec and quality configuration
    const getCodecParams = (codec, quality, stronger = false) => {
        const qualityMap = { low: 0, medium: 1, high: 2 };
        const h264_crf = [30, 26, 22];
        const vp8_crf = [35, 30, 25];
        const vp9_crf = [40, 35, 30];
        
        let ext = 'mp4';
        let params = [];
        let crf_value;
        let qualityIndex = qualityMap[quality] || 1;

        switch(codec) {
            case 'libvpx': // VP8
                ext = 'webm';
                crf_value = vp8_crf[qualityIndex];
                if (stronger) crf_value += 5;
                params.push('-c:v', 'libvpx', '-crf', crf_value.toString(), '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8');
                break;
            case 'libvpx-vp9': // VP9
                ext = 'webm';
                crf_value = vp9_crf[qualityIndex];
                if (stronger) crf_value += 5;
                params.push('-c:v', 'libvpx-vp9', '-crf', crf_value.toString(), '-b:v', '0', '-deadline', 'realtime', '-row-mt', '1');
                break;
            default: // H.264
                ext = 'mp4';
                crf_value = h264_crf[qualityIndex];
                if (stronger) crf_value += 4;
                params.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf_value.toString());
                break;
        }
        
        params.push('-c:a', 'aac', '-b:a', '128k');
        params.push('-vf', 'scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2');
        params.push('-threads', '1');
        
        if (codec === 'libx264') {
            params.push('-x264-params', 'threads=1:sliced-threads=0');
        }
        
        return { ext, params };
    };

    // Initialize FFmpeg with version detection
    const initializeFFmpeg = async () => {
        if (isFFmpegLoaded && ffmpeg) {
            console.log('[VideoProcessing] FFmpeg already loaded');
            return ffmpeg;
        }

        const config = getFFmpegConfig();
        console.log(`[VideoProcessing] Initializing FFmpeg ${config.version}...`);
        console.log('[VideoProcessing] Available global objects:', {
            hasGlobalFFmpeg: typeof global.FFmpeg !== 'undefined',
            hasGlobalCreateFFmpeg: typeof global.createFFmpeg !== 'undefined',
            hasSelfFFmpeg: typeof self.FFmpeg !== 'undefined',
            hasSelfCreateFFmpeg: typeof self.createFFmpeg !== 'undefined',
            hasCreateFFmpeg: typeof createFFmpeg !== 'undefined',
            hasWindow: typeof window !== 'undefined',
            config: config
        });

        try {
            if (config.version === 'v0.12.x') {
                // FFmpeg v0.12.x (Web CDN) - This path should not be used anymore
                // since we're using local v0.11.x files for both extension and web
                throw new Error('v0.12.x CDN version is deprecated. Using local v0.11.x files instead.');
                
            } else {
                // FFmpeg v0.11.x (Extension)
                console.log('[VideoProcessing] Checking for v0.11.x FFmpeg functions...');
                console.log('[VideoProcessing] Available:', {
                    globalCreateFFmpeg: typeof global.createFFmpeg,
                    globalFFmpegCreateFFmpeg: typeof global.FFmpeg?.createFFmpeg,
                    selfCreateFFmpeg: typeof self.createFFmpeg,
                    selfFFmpegCreateFFmpeg: typeof self.FFmpeg?.createFFmpeg,
                    createFFmpeg: typeof createFFmpeg
                });
                
                if (!global.createFFmpeg && !global.FFmpeg?.createFFmpeg && !self.createFFmpeg && !self.FFmpeg?.createFFmpeg && typeof createFFmpeg === 'undefined') {
                    throw new Error('FFmpeg v0.11.x library not loaded - no createFFmpeg function found');
                }
                
                const createFFmpegFunc = global.FFmpeg?.createFFmpeg || global.createFFmpeg || self.FFmpeg?.createFFmpeg || self.createFFmpeg || createFFmpeg;
                console.log('[VideoProcessing] Using createFFmpeg function:', typeof createFFmpegFunc);
                
                ffmpeg = createFFmpegFunc({
                    log: true,
                    corePath: config.coreURL,
                });
                
                console.log('[VideoProcessing] FFmpeg instance created successfully');
                
                ffmpeg.setLogger(({ type, message }) => {
                    if (type === 'fferr') {
                        console.error(`[FFmpeg Error]: ${message}`);
                    }
                });

                await ffmpeg.load();
            }

            isFFmpegLoaded = true;
            console.log('[VideoProcessing] FFmpeg loaded successfully!');
            return ffmpeg;

        } catch (error) {
            console.error('[VideoProcessing] Failed to load FFmpeg:', error);
            throw error;
        }
    };

    // Main compression function
    const compressVideo = async (videoFile, settings = {}, progressCallback) => {
        const {
            codec = 'libx264',
            quality = 'medium',
            maxSizeMB = MAX_SIZE_MB
        } = settings;

        const log = (message) => {
            console.log(`[VideoProcessing]: ${message}`);
            if (progressCallback) progressCallback(message);
        };

        try {
            log(`Starting compression for ${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(1)}MB)`);
            log(`Settings: codec=${codec}, quality=${quality}, maxSizeMB=${maxSizeMB}`);
            
            log('Initializing FFmpeg...');
            const ffmpegInstance = await initializeFFmpeg();
            
            if (!ffmpegInstance) {
                throw new Error('Failed to initialize FFmpeg instance');
            }
            
            log('FFmpeg initialized successfully');
        
        const inputFileName = videoFile.name || 'input.mp4';
        const originalSize = videoFile.size;
        
        log('Loading video file into FFmpeg...');
        
        // Handle different FFmpeg versions
        const config = getFFmpegConfig();
        if (config.version === 'v0.12.x') {
            // FFmpeg v0.12.x - deprecated, should not be used
            throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
        } else {
            // FFmpeg v0.11.x - use the correct fetchFile function
            // In web context, fetchFile should be available from the global FFmpeg object
            const fetchFileFunc = global.FFmpeg?.fetchFile || global.fetchFile;
            if (!fetchFileFunc) {
                throw new Error('fetchFile function not found. Make sure FFmpeg v0.11.x is loaded properly.');
            }
            await ffmpegInstance.FS('writeFile', inputFileName, await fetchFileFunc(videoFile));
        }

        try {
            // First pass - initial compression
            log('Starting initial compression...');
            const { ext, params: initialParams } = getCodecParams(codec, quality);
            const outputFileName = `compressed.${ext}`;
            
            log(`Running FFmpeg with codec: ${codec}, quality: ${quality}`);
            
            if (config.version === 'v0.12.x') {
                throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
            } else {
                await ffmpegInstance.run('-i', inputFileName, ...initialParams, outputFileName);
            }
            
            let data;
            if (config.version === 'v0.12.x') {
                throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
            } else {
                data = ffmpegInstance.FS('readFile', outputFileName);
            }
            
            let compressedSize = data.buffer ? data.buffer.byteLength : data.byteLength;
            log(`Initial compression complete. Size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
            
            // Second pass if file is still too large
            if (compressedSize > maxSizeMB * 1024 * 1024) {
                log(`File larger than ${maxSizeMB}MB. Applying stronger compression...`);
                
                // Clean up first pass file
                if (config.version === 'v0.12.x') {
                    throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
                } else {
                    ffmpegInstance.FS('unlink', outputFileName);
                }
                
                const { ext: strongerExt, params: strongerParams } = getCodecParams(codec, quality, true);
                const strongerOutputFileName = `compressed_stronger.${strongerExt}`;
                
                log('Running stronger compression...');
                
                if (config.version === 'v0.12.x') {
                    throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
                } else {
                    await ffmpegInstance.run('-i', inputFileName, ...strongerParams, strongerOutputFileName);
                    data = ffmpegInstance.FS('readFile', strongerOutputFileName);
                    ffmpegInstance.FS('unlink', strongerOutputFileName);
                }
                
                compressedSize = data.buffer ? data.buffer.byteLength : data.byteLength;
                log(`Stronger compression complete. Final size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
            } else {
                // Clean up initial compression file
                if (config.version === 'v0.12.x') {
                    throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
                } else {
                    ffmpegInstance.FS('unlink', outputFileName);
                }
            }

            // Create result blob with appropriate MIME type
            const mimeType = ext === 'webm' ? 'video/webm' : 'video/mp4';
            const blobData = data.buffer || data;
            const blob = new Blob([blobData], { type: mimeType });
            
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
            log(`Compression failed: ${error.message || error}`);
            console.error('[VideoProcessing] Full error details:', error);
            throw new Error(`Video compression failed: ${error.message || error}`);
        } finally {
            // Clean up input file
            try {
                if (config.version === 'v0.12.x') {
                    throw new Error('v0.12.x is deprecated. Using v0.11.x instead.');
                } else {
                    ffmpegInstance.FS('unlink', inputFileName);
                }
            } catch (e) {
                log(`Cleanup warning: ${e.message || e}`);
                // Ignore if file doesn't exist
            }
        }
        
        } catch (outerError) {
            log(`Outer compression error: ${outerError.message || outerError}`);
            console.error('[VideoProcessing] Outer error details:', outerError);
            throw outerError;
        }
    };

    // Utility functions
    const estimateCompressionTime = (fileSizeMB, codec) => {
        const baseTimePerMB = {
            'libx264': 2,
            'libvpx': 4,
            'libvpx-vp9': 8
        };
        return Math.ceil(fileSizeMB * baseTimePerMB[codec]);
    };

    const getRecommendedCodec = (fileSizeMB) => {
        if (fileSizeMB < 50) return 'libx264';
        if (fileSizeMB < 200) return 'libvpx';
        return 'libvpx-vp9';
    };

    // Export API
    const VideoProcessing = {
        initializeFFmpeg,
        compressVideo,
        estimateCompressionTime,
        getRecommendedCodec
    };

    // Make available globally
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = VideoProcessing;
    } else {
        global.VideoProcessing = VideoProcessing;
    }

})(typeof window !== 'undefined' ? window : this); 