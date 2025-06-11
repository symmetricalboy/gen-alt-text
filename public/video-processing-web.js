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
        
        // Web client with CDN
        return {
            coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
            version: 'v0.12.x'
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

        try {
            if (config.version === 'v0.12.x') {
                // FFmpeg v0.12.x (Web CDN)
                if (!global.FFmpeg || !global.FFmpeg.FFmpeg) {
                    throw new Error('FFmpeg v0.12.x library not loaded. Include the CDN script first.');
                }
                
                ffmpeg = new global.FFmpeg.FFmpeg();
                
                ffmpeg.on('log', ({ type, message }) => {
                    if (type === 'fferr') {
                        console.error(`[FFmpeg Error]: ${message}`);
                    }
                });

                await ffmpeg.load({ coreURL: config.coreURL });
                
            } else {
                // FFmpeg v0.11.x (Extension)
                if (!global.createFFmpeg && !global.FFmpeg?.createFFmpeg) {
                    throw new Error('FFmpeg v0.11.x library not loaded');
                }
                
                const createFFmpegFunc = global.FFmpeg?.createFFmpeg || global.createFFmpeg;
                ffmpeg = createFFmpegFunc({
                    log: true,
                    corePath: config.coreURL,
                });
                
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

        log('Initializing FFmpeg...');
        const ffmpegInstance = await initializeFFmpeg();
        
        const inputFileName = videoFile.name || 'input.mp4';
        const originalSize = videoFile.size;
        
        log('Loading video file into FFmpeg...');
        
        // Handle different FFmpeg versions
        const config = getFFmpegConfig();
        if (config.version === 'v0.12.x') {
            // FFmpeg v0.12.x uses different API
            await ffmpegInstance.writeFile(inputFileName, await global.FFmpeg.fetchFile(videoFile));
        } else {
            // FFmpeg v0.11.x
            await ffmpegInstance.FS('writeFile', inputFileName, await global.fetchFile(videoFile));
        }

        try {
            // First pass - initial compression
            log('Starting initial compression...');
            const { ext, params: initialParams } = getCodecParams(codec, quality);
            const outputFileName = `compressed.${ext}`;
            
            log(`Running FFmpeg with codec: ${codec}, quality: ${quality}`);
            
            if (config.version === 'v0.12.x') {
                await ffmpegInstance.exec(['-i', inputFileName, ...initialParams, outputFileName]);
            } else {
                await ffmpegInstance.run('-i', inputFileName, ...initialParams, outputFileName);
            }
            
            let data;
            if (config.version === 'v0.12.x') {
                data = await ffmpegInstance.readFile(outputFileName);
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
                    await ffmpegInstance.deleteFile(outputFileName);
                } else {
                    ffmpegInstance.FS('unlink', outputFileName);
                }
                
                const { ext: strongerExt, params: strongerParams } = getCodecParams(codec, quality, true);
                const strongerOutputFileName = `compressed_stronger.${strongerExt}`;
                
                log('Running stronger compression...');
                
                if (config.version === 'v0.12.x') {
                    await ffmpegInstance.exec(['-i', inputFileName, ...strongerParams, strongerOutputFileName]);
                    data = await ffmpegInstance.readFile(strongerOutputFileName);
                    await ffmpegInstance.deleteFile(strongerOutputFileName);
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
                    await ffmpegInstance.deleteFile(outputFileName);
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
            log(`Compression failed: ${error}`);
            throw new Error(`Video compression failed: ${error}`);
        } finally {
            // Clean up input file
            try {
                if (config.version === 'v0.12.x') {
                    await ffmpegInstance.deleteFile(inputFileName);
                } else {
                    ffmpegInstance.FS('unlink', inputFileName);
                }
            } catch (e) {
                // Ignore if file doesn't exist
            }
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