import { FFmpeg, createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

// Import types but use the shared implementation in video-processing-web.js
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

// This is a bridge to the shared implementation in video-processing-web.js
// It provides TypeScript typing while delegating actual implementation to the shared module

/**
 * Initializes and loads the FFmpeg instance.
 */
export async function initializeFFmpeg(): Promise<void> {
  // Access the global VideoProcessing object that was loaded from video-processing-web.js
  if (typeof window !== 'undefined' && window.VideoProcessing) {
    await window.VideoProcessing.initFFmpeg();
  } else if (typeof self !== 'undefined' && self.VideoProcessing) {
    await self.VideoProcessing.initFFmpeg();
  } else {
    throw new Error('VideoProcessing module not found. Make sure video-processing-web.js is loaded.');
  }
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
  // Access the global VideoProcessing object
  let videoProcessing: any;
  
  if (typeof window !== 'undefined' && window.VideoProcessing) {
    videoProcessing = window.VideoProcessing;
  } else if (typeof self !== 'undefined' && self.VideoProcessing) {
    videoProcessing = self.VideoProcessing;
  } else {
    throw new Error('VideoProcessing module not found. Make sure video-processing-web.js is loaded.');
  }
  
  // Map VideoCodec constants
  const mapCodec = (codec?: VideoCodec): string => {
    if (!codec) return videoProcessing.VideoCodec.H264;
    
    switch (codec) {
      case 'libvpx': return videoProcessing.VideoCodec.VP8;
      case 'libvpx-vp9': return videoProcessing.VideoCodec.VP9;
      default: return videoProcessing.VideoCodec.H264;
    }
  };
  
  // Map VideoQuality constants
  const mapQuality = (quality?: VideoQuality): string => {
    if (!quality) return videoProcessing.VideoQuality.MEDIUM;
    
    switch (quality) {
      case 'low': return videoProcessing.VideoQuality.LOW;
      case 'high': return videoProcessing.VideoQuality.HIGH;
      default: return videoProcessing.VideoQuality.MEDIUM;
    }
  };
  
  // Delegate to the shared implementation
  return await videoProcessing.compressVideo(
    videoFile,
    {
      codec: mapCodec(settings.codec),
      quality: mapQuality(settings.quality),
      maxSizeMB: settings.maxSizeMB || 20
    },
    progressCallback
  );
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
  
  // Access the global VideoProcessing object
  let videoProcessing: any;
  
  if (typeof window !== 'undefined' && window.VideoProcessing) {
    videoProcessing = window.VideoProcessing;
  } else if (typeof self !== 'undefined' && self.VideoProcessing) {
    videoProcessing = self.VideoProcessing;
  } else {
    // Fallback to direct implementation if shared module is not available
    const result = await compressVideo(videoFile, {}, progressCallback);
    return [result.blob];
  }
  
  // Delegate to the shared implementation
  return await videoProcessing.processVideoIntoChunks(videoFile, progressCallback);
}

// Additional utility functions

/**
 * Utility function to estimate compression time based on file size
 */
export function estimateCompressionTime(fileSizeMB: number, codec: VideoCodec): number {
  // Rough estimates in seconds based on codec efficiency
  const baseTimePerMB = {
    'libx264': 2,    // Fastest
    'libvpx': 4,     // Medium
    'libvpx-vp9': 6  // Slowest but best compression
  };
  
  const timePerMB = baseTimePerMB[codec] || baseTimePerMB['libx264'];
  
  // Larger files don't scale linearly, so use a logarithmic scale
  const estimatedTime = timePerMB * fileSizeMB * (1 + Math.log10(fileSizeMB) * 0.1);
  
  return Math.max(5, Math.min(300, Math.round(estimatedTime))); // Between 5s and 5min
}

/**
 * Returns the recommended codec based on file size
 */
export function getRecommendedCodec(fileSizeMB: number): VideoCodec {
  if (fileSizeMB > 50) {
    // For very large files, VP9 gives best compression
    return 'libvpx-vp9';
  } else if (fileSizeMB > 20) {
    // For medium-large files, VP8 is a good balance
    return 'libvpx';
  } else {
    // For smaller files, H.264 is fastest with good quality
    return 'libx264';
  }
}

// Add global type declarations for the VideoProcessing object
declare global {
  interface Window {
    VideoProcessing: any;
  }
  
  interface WorkerGlobalScope {
    VideoProcessing: any;
  }
} 