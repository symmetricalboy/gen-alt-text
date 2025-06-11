// Helper function to log and track loading states
let coreScriptLoaded = false;
let ffmpegWrapperScriptLoaded = false;
let handlerScriptLoaded = false;

function logStatus(message) {
  console.log(`[Offscreen HTML] ${message}`);
  
  // If we detect a script load failure, report it
  if (message.includes('failed') || message.includes('error')) {
    try {
      chrome.runtime.sendMessage({ 
        type: 'ffmpegStatusOffscreen', 
        payload: { 
          status: `FFmpeg script load issue: ${message}`, 
          error: message,
          progress: 'error',
          timestamp: new Date().toISOString()
        } 
      });
    } catch (e) {
      console.error('[Offscreen HTML] Error sending status message:', e);
    }
  }
}

// Handle global errors
window.addEventListener('error', (event) => {
  logStatus(`Script error: ${event.message} in ${event.filename}:${event.lineno}`);
});

// Use dynamic script loading to better track the loading process
function loadScript(src, id, onLoad, onError) {
  const script = document.createElement('script');
  script.src = src;
  script.id = id;
  script.async = false; // Keep scripts loading in order
  
  script.onload = () => {
    logStatus(`${id} loaded successfully`);
    if (onLoad) onLoad();
  };
  
  script.onerror = (e) => {
    logStatus(`${id} failed to load: ${e}`);
    if (onError) onError(e);
  };
  
  document.head.appendChild(script);
  logStatus(`${id} script element added to document`);
}

// Function to properly load the FFmpeg library and expose it globally
function loadFFmpegLibrary() {
  logStatus('Attempting to load ffmpeg-core.js first...');
  loadScript('/assets/ffmpeg/ffmpeg-core.js', 'ffmpeg-core-script',
    () => { // ffmpeg-core.js loaded
      coreScriptLoaded = true;
      if (typeof self.createFFmpegCore === 'function') {
        logStatus('ffmpeg-core.js loaded successfully. self.createFFmpegCore is available.');
      } else {
        logStatus('WARNING: ffmpeg-core.js loaded, but self.createFFmpegCore is NOT defined. The wrapper might not find it.');
      }
      // Proceed to load the wrapper
      loadFFmpegWrapper();
    },
    () => { // ffmpeg-core.js failed to load
      logStatus('CRITICAL ERROR: ffmpeg-core.js failed to load. FFmpeg cannot be initialized.');
      // Still load handler to report this upstream
      loadHandlerScript(); 
    }
  );
}

function loadFFmpegWrapper() {
  logStatus('Attempting to load ffmpeg.min.js (wrapper)...');
  loadScript('/assets/ffmpeg/ffmpeg.min.js', 'ffmpeg-script-wrapper',
    () => { // ffmpeg.min.js (wrapper) loaded
      ffmpegWrapperScriptLoaded = true;
      logStatus('ffmpeg.min.js (wrapper) loaded successfully. Checking for createFFmpeg...');
      // For FFmpeg v0.11.x, we expect createFFmpeg function at self.FFmpeg.createFFmpeg
      if (typeof self.FFmpeg === 'object' && self.FFmpeg !== null && typeof self.FFmpeg.createFFmpeg === 'function') {
          logStatus('ffmpeg.min.js (v0.11.x wrapper) processed: self.FFmpeg.createFFmpeg is available.');
      } else if (typeof self.createFFmpeg === 'function') {
          logStatus('ffmpeg.min.js (v0.11.x wrapper) processed: self.createFFmpeg is available.');
      } else if (typeof createFFmpeg === 'function') {
          logStatus('ffmpeg.min.js (v0.11.x wrapper) processed: global createFFmpeg is available.');
      } else {
          logStatus('ERROR: ffmpeg.min.js (v0.11.x wrapper) loaded, but createFFmpeg is NOT available.');
          console.error('[Offscreen HTML] Expected createFFmpeg after loading ffmpeg.min.js for v0.11.x');
      }
      // Regardless of wrapper success, load the handler
      loadHandlerScript();
    },
    () => { // ffmpeg.min.js (wrapper) failed
      logStatus('CRITICAL ERROR: Main FFmpeg script (ffmpeg.min.js wrapper) failed to load.');
      loadHandlerScript(); // Load handler to report
    }
  );
}

// Initialize loading sequence
window.onload = function() {
  logStatus('Document loaded, beginning script loading sequence');
  loadFFmpegLibrary(); // Start with core.js
};

function loadHandlerScript() {
  // First load the video processing web module
  loadScript('/video-processing-web.js', 'video-processing-web-script',
    () => {
      logStatus('Video processing web module loaded.');
      const videoProcessingReady = typeof VideoProcessing !== 'undefined';
      logStatus(`VideoProcessing available: ${videoProcessingReady}`);
      
      // Now load the handler script
      loadActualHandlerScript();
    },
    (e) => {
      logStatus(`Video processing web module failed to load: ${e}`);
      // Continue loading handler script even if video processing fails
      loadActualHandlerScript();
    }
  );
}

function loadActualHandlerScript() {
  // Now load the handler script
  loadScript('/offscreen-ffmpeg-handler.js', 'handler-script',
    () => {
      handlerScriptLoaded = true;
      logStatus('Handler script loaded.');
      
      const coreReady = typeof self.createFFmpegCore === 'function';
      // For FFmpeg v0.11.x, we expect createFFmpeg function at self.FFmpeg.createFFmpeg
      const wrapperReady = (typeof self.FFmpeg === 'object' && self.FFmpeg !== null && typeof self.FFmpeg.createFFmpeg === 'function') ||
                          typeof self.createFFmpeg === 'function' || typeof createFFmpeg === 'function';
      const videoProcessingReady = typeof VideoProcessing !== 'undefined';
      
      let statusMsg = `Handler loaded. Core ready: ${coreReady}. Wrapper ready: ${wrapperReady}. VideoProcessing ready: ${videoProcessingReady}.`;
      if (!coreReady) statusMsg += ' (Core script issue!)';
      if (!wrapperReady) statusMsg += ' (Wrapper script issue!)';
      if (!videoProcessingReady) statusMsg += ' (VideoProcessing script issue!)';

      logStatus(statusMsg);

      try {
        chrome.runtime.sendMessage({ 
          type: 'ffmpegStatusOffscreen', 
          payload: { 
            status: statusMsg, 
            progress: 'scripts-loaded',
            coreReady: coreReady,
            wrapperReady: wrapperReady,
            videoProcessingReady: videoProcessingReady,
            timestamp: new Date().toISOString()
          }
        }).catch(e => console.warn('[Offscreen HTML] Error sending scripts-loaded message:', e.message));
      } catch (e) { console.error('[Offscreen HTML] Error sending scripts-loaded message:', e); }
    },
    (e) => {
      logStatus(`Handler script failed to load: ${e}`);
      try {
        chrome.runtime.sendMessage({ 
          type: 'ffmpegStatusOffscreen', 
          payload: { 
            status: 'Critical error: offscreen-ffmpeg-handler.js failed to load.', 
            error: `Handler script failed to load: ${e}`, progress: 'error',
            timestamp: new Date().toISOString()
          }
        }).catch(err => console.warn('[Offscreen HTML] Error sending handler load error message:', err.message));
      } catch (err) { console.error('[Offscreen HTML] Error sending handler load error message:', err); }
    }
  );
}
