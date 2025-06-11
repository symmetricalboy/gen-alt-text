import { FFmpeg, createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

let ffmpeg: FFmpeg | null = null;
let isFFmpegLoaded = false;
const MAX_SIZE_MB = 20; // Files larger than this will get stronger compression

export type VideoCodec = 'libx264' | 'libvpx' | 'libvpx-vp9';
export type VideoQuality = 'low' | 'medium' | 'high';

export interface CompressionSettings {
  codec?: VideoCodec;
  quality?: VideoQuality;
  maxSizeMB?: number;
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  codec: VideoCodec;
  quality: VideoQuality;
}

/**
 * Detects the runtime environment and returns appropriate core URL
 */
function getFFmpegCoreURL(): string {
  // Check if we're in a browser extension context
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL('assets/ffmpeg/ffmpeg-core.js');
  }
  
  // Check if we're in a web context with a specific CDN version
  if (typeof window !== 'undefined' && window.location) {
    return "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";
  }
  
  // Fallback
  return "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";
}

/**
 * Initializes and loads the FFmpeg instance.
 * @returns A promise that resolves with the loaded FFmpeg instance.
 */
async function initFFmpeg(): Promise<FFmpeg> {
  if (isFFmpegLoaded && ffmpeg) {
    console.log('FFmpeg already loaded.');
    return ffmpeg;
  }

  console.log('Initializing FFmpeg...');
  ffmpeg = createFFmpeg({
    log: true,
    corePath: getFFmpegCoreURL(),
  });
  
  // Suppress verbose logs in production, but keep errors
  ffmpeg.setLogger(({ type, message }) => {
    if (type === 'fferr') {
      console.error(`[FFmpeg Error]: ${message}`);
    } else {
      // console.log(`[FFmpeg]: ${message}`); // Uncomment for debug logs
    }
  });

  await ffmpeg.load();
  isFFmpegLoaded = true;
  console.log('FFmpeg loaded successfully!');
  return ffmpeg;
}

/**
 * Public function to initialize FFmpeg (for external use)
 */
export async function initializeFFmpeg(): Promise<void> {
  await initFFmpeg();
}

/**
 * Gets codec parameters based on codec type and quality settings
 */
async function getCodecParams(codec: VideoCodec, quality: VideoQuality, stronger = false) {
  let ext = 'mp4';
  let params = [];

  const qualityMap = { low: 0, medium: 1, high: 2 };
  
  const h264_crf = [30, 26, 22]; // Low, Medium, High
  const vp8_crf = [35, 30, 25];
  const vp9_crf = [40, 35, 30];
  
  let crf_value;
  let qualityIndex = qualityMap[quality];

  switch(codec) {
    case 'libvpx': // VP8
      ext = 'webm';
      crf_value = vp8_crf[qualityIndex] || vp8_crf[1];
      if (stronger) crf_value += 5;
      params.push('-c:v', 'libvpx', '-crf', crf_value.toString(), '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8');
      break;
    case 'libvpx-vp9': // VP9
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
      break;
  }
  
  params.push('-c:a', 'aac', '-b:a', '128k');
  params.push('-vf', 'scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2');
  params.push('-threads', '1');
  
  if (codec === 'libx264') {
    params.push('-x264-params', 'threads=1:sliced-threads=0');
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
export async function compressVideo(
  videoFile: File,
  settings: CompressionSettings = {},
  progressCallback?: (message: string) => void
): Promise<CompressionResult> {
  const {
    codec = 'libx264',
    quality = 'medium',
    maxSizeMB = MAX_SIZE_MB
  } = settings;

  const log = (message: string) => {
    console.log(`[Video Compression]: ${message}`);
    progressCallback?.(message);
  };

  log('Initializing FFmpeg...');
  const ffmpegInstance = await initFFmpeg();
  
  const inputFileName = videoFile.name || 'input.mp4';
  const originalSize = videoFile.size;
  
  log('Loading video file into FFmpeg...');
  ffmpegInstance.FS('writeFile', inputFileName, await fetchFile(videoFile));

  try {
    // First pass - initial compression
    log('Starting initial compression...');
    const { ext, params: initialParams } = await getCodecParams(codec, quality);
    const outputFileName = `compressed.${ext}`;
    
    log(`Running FFmpeg with codec: ${codec}, quality: ${quality}`);
    await ffmpegInstance.run('-i', inputFileName, ...initialParams, outputFileName);
    
    let data = ffmpegInstance.FS('readFile', outputFileName);
    let compressedSize = data.buffer.byteLength;
    log(`Initial compression complete. Size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Second pass if file is still too large
    if (compressedSize > maxSizeMB * 1024 * 1024) {
      log(`File larger than ${maxSizeMB}MB. Applying stronger compression...`);
      
      // Clean up first pass file
      ffmpegInstance.FS('unlink', outputFileName);
      
      const { ext: strongerExt, params: strongerParams } = await getCodecParams(codec, quality, true);
      const strongerOutputFileName = `compressed_stronger.${strongerExt}`;
      
      log('Running stronger compression...');
      await ffmpegInstance.run('-i', inputFileName, ...strongerParams, strongerOutputFileName);
      
      data = ffmpegInstance.FS('readFile', strongerOutputFileName);
      compressedSize = data.buffer.byteLength;
      
      log(`Stronger compression complete. Final size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Clean up stronger compression file
      ffmpegInstance.FS('unlink', strongerOutputFileName);
    } else {
      // Clean up initial compression file
      ffmpegInstance.FS('unlink', outputFileName);
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
    log(`Compression failed: ${error}`);
    throw new Error(`Video compression failed: ${error}`);
  } finally {
    // Clean up input file
    try {
      ffmpegInstance.FS('unlink', inputFileName);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Legacy function for backward compatibility - processes video into chunks
 * @deprecated Use compressVideo instead for single file compression
 */
export async function processVideoIntoChunks(
  videoFile: File, 
  progressCallback: (message: string) => void
): Promise<Blob[]> {
  console.warn('processVideoIntoChunks is deprecated. Use compressVideo for single file compression.');
  
  const result = await compressVideo(videoFile, {}, progressCallback);
  return [result.blob];
}

/**
 * Utility function to estimate compression time based on file size
 */
export function estimateCompressionTime(fileSizeMB: number, codec: VideoCodec): number {
  // Rough estimates in seconds based on codec efficiency
  const baseTimePerMB = {
    'libx264': 2,    // Fastest
    'libvpx': 4,     // Medium
    'libvpx-vp9': 8  // Slowest but best compression
  };
  
  return Math.ceil(fileSizeMB * baseTimePerMB[codec]);
}

/**
 * Get recommended codec based on file size and use case
 */
export function getRecommendedCodec(fileSizeMB: number): VideoCodec {
  if (fileSizeMB < 50) {
    return 'libx264'; // Fast compression for smaller files
  } else if (fileSizeMB < 200) {
    return 'libvpx'; // Good balance for medium files
  } else {
    return 'libvpx-vp9'; // Best compression for large files
  }
} 