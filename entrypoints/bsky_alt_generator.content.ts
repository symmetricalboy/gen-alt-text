export default defineContentScript({
  matches: ['*://*.bsky.app/*'],
  main() {
    console.log('Bluesky Alt Text Generator loaded');
    
    // Only run in browser (not during build/ssr)
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
    // Constants
    const ALT_TEXT_SELECTORS = [
      'textarea[aria-label="Alt text"]',
      'textarea[placeholder*="alt"]',
      'textarea[placeholder*="Alt"]',
      'textarea[data-testid*="alt"]',
      '[role="textbox"][aria-label*="alt" i]'
    ];
    const ALT_TEXT_SELECTOR = ALT_TEXT_SELECTORS.join(',');
    const BUTTON_ID = 'gemini-alt-text-button';
    
    // Toast notification system
    const createToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration: number = 8000) => {
      let toastContainer = document.getElementById('gemini-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'gemini-toast-container';
        Object.assign(toastContainer.style, {
          position: 'fixed', bottom: '20px', right: '20px', zIndex: '10000',
          display: 'flex', flexDirection: 'column', gap: '10px'
        });
        document.body.appendChild(toastContainer);
      }
      
      const toast = document.createElement('div');
      Object.assign(toast.style, {
        padding: '12px 16px', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        margin: '5px', minWidth: '200px', color: '#ffffff', fontSize: '14px',
        transition: 'all 0.3s ease'
      });
      
      const colors = { success: '#1da882', error: '#e53935', warning: '#f59f0b', info: '#007eda' };
      toast.style.backgroundColor = colors[type] || colors.info;
      toast.textContent = message;
      
      const closeBtn = document.createElement('span');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
         marginLeft: '8px', cursor: 'pointer', float: 'right', fontWeight: 'bold'
      });
      closeBtn.onclick = () => {
        if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
      };
      toast.appendChild(closeBtn);
      
      toastContainer.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
      }, duration);
    };
    
    // Function to find media elements in the composer
    const findMediaElement = (container: Element): HTMLImageElement | HTMLVideoElement | null => {
      console.log('[findMediaElement - Simplified] Searching for media in container:', container);

      const isElementVisible = (el: Element | null): el is HTMLElement => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null;
      };
      
      const selectors: string[] = [
        '[data-testid="imagePreview"] img[src]', 
        '[data-testid="images"] img[src]',
        '[data-testid="videoPreview"] video[src]', 
        '[data-testid="videos"] video[src]',
        '[data-testid="videoPreview"] video source[src]',
        '[data-testid="videos"] video source[src]',
        'img[src]:not([alt*="avatar" i]):not([src*="avatar"])', 
        'video[src]', 
        'video source[src]'
      ];

      // Array to collect all visible media elements
      const visibleElements: (HTMLImageElement | HTMLVideoElement)[] = [];

      for (const selector of selectors) {
          // Get all matching elements instead of just the first one
          const elements = container.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLSourceElement>(selector);
          
          elements.forEach(element => {
              if (element instanceof HTMLSourceElement) {
                  const videoParent = element.closest('video');
                  if (videoParent && isElementVisible(videoParent) && !visibleElements.includes(videoParent)) {
                      visibleElements.push(videoParent);
                  }
              } else if (element && isElementVisible(element) && !visibleElements.includes(element)) {
                  visibleElements.push(element);
              }
          });
      }

      if (visibleElements.length > 0) {
          // Select the LAST media element (most likely the one being added in a reply)
          const lastElement = visibleElements[visibleElements.length - 1];
          console.log(`[findMediaElement - Simplified] Found ${visibleElements.length} media elements, using the last one:`, lastElement);
          return lastElement;
      }

      console.error('[findMediaElement - Simplified] FAILED: No suitable media found using direct selectors.');
      return null;
    };

    // Function to find the composer container for a given element (e.g., textarea, media)
    const findComposerContainer = (element: Element): HTMLElement | null => {
        // Common parent containers for alt text fields or media previews
        const potentialContainers = [
            element.closest<HTMLElement>('[data-testid="composePostView"]'), // Main composer
            element.closest<HTMLElement>('[role="dialog"][aria-label*="alt text" i]'), // Alt text modal
            element.closest<HTMLElement>('[aria-label="Video settings"]'), // Video settings modal
            // Add more specific selectors if needed based on bsky.app structure
        ];

        for (const container of potentialContainers) {
            if (container) {
                console.log('[findComposerContainer] Found container:', container, 'for element:', element);
                return container;
            }
        }
        console.warn('[findComposerContainer] Could not find a known composer/dialog container for element:', element);
        return null; // Fallback if no known container is found
    };
    
    // Function to get media element source (URL or Data URL)
    const getMediaSource = async (mediaElement: HTMLImageElement | HTMLVideoElement): Promise<string | null> => {
      try {
        let src = '';
        if (mediaElement instanceof HTMLImageElement) {
           src = mediaElement.currentSrc || mediaElement.src; // Use currentSrc for responsive images
        } else if (mediaElement instanceof HTMLVideoElement) {
           // Prefer source element if available
           const sourceEl = mediaElement.querySelector('source');
           src = sourceEl?.src || mediaElement.src;
        }
        
        if (!src) {
            console.error('[getMediaSource] Media element has no discernible src attribute.', mediaElement);
            return null;
        }

        if (src.startsWith('data:')) {
          console.log('[getMediaSource] Source is already a Data URL.');
          return src;
        } else if (src.startsWith('blob:')) {
          console.log('[getMediaSource] Source is a Blob URL, processing...');
          try {
            const response = await fetch(src);
            const blob = await response.blob();
            
            // Process all videos in full up to 100MB
            console.log(`[getMediaSource] Processing full video (size: ${(blob.size / (1024 * 1024)).toFixed(2)}MB)`);
            
            // Normal processing for all videos and images
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (fetchError) {
            console.error('[getMediaSource] Error fetching or converting blob URL:', fetchError);
            throw new Error(`Failed to process blob URL: ${fetchError instanceof Error ? fetchError.message : fetchError}`);
          }
        } else if (src.startsWith('http:') || src.startsWith('https:')) {
          // Return the HTTP(S) URL directly for the background script to handle
          console.log('[getMediaSource] Source is an HTTP(S) URL:', src);
          return src;
        } else {
           console.warn('[getMediaSource] Unhandled src type:', src.substring(0, 30) + '...');
           // Fallback: Try canvas for images (might fail cross-origin) but not for video
           if (mediaElement instanceof HTMLImageElement) {
                console.log('[getMediaSource] Attempting canvas fallback for image src:', src);
                const canvas = document.createElement('canvas');
                canvas.width = mediaElement.naturalWidth || mediaElement.width;
                canvas.height = mediaElement.naturalHeight || mediaElement.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Could not get 2D context for image fallback');
                ctx.drawImage(mediaElement, 0, 0);
                return canvas.toDataURL(); // Might throw CORS error
           }
           return null; // Cannot handle other types or video via canvas here
        }
      } catch (error) {
        console.error('[getMediaSource] Error processing media source:', error, mediaElement);
        createToast('Error processing media. It might be protected or inaccessible.', 'error');
        return null;
      }
    };
    
    // Function to extract a frame from a video element
    const extractVideoFrame = (videoElement: HTMLVideoElement): Promise<string> => {
      return new Promise((resolve, reject) => {
        try {
          // Create a canvas to capture the video frame
          const canvas = document.createElement('canvas');
          
          // Set dimensions to match video
          canvas.width = videoElement.videoWidth || videoElement.clientWidth;
          canvas.height = videoElement.videoHeight || videoElement.clientHeight;
          
          // Get the canvas context
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Could not get 2D context for video frame extraction');
          }
          
          // Choose a representative frame (either current time or 20% into the video)
          let seekTime = videoElement.currentTime;
          if (seekTime === 0 && videoElement.duration) {
            // If at the beginning, try to seek to a more representative frame
            seekTime = Math.min(videoElement.duration * 0.2, 3); // 20% in or 3 seconds, whichever is less
          }
          
          // Define the seeked handler outside the if block so it's in scope for removal
          let seekedHandler: () => void;
          
          // For videos that aren't playing, we need to set the current time and wait for it to update
          const handleSeek = () => {
            // Draw the current video frame to the canvas
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            
            // Get the data URL from the canvas (this is a JPEG frame from the video)
            const frameDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            
            // Clean up event listeners if any were added
            if (seekedHandler) {
              videoElement.removeEventListener('seeked', seekedHandler);
            }
            
            // Return the frame data URL
            console.log('[extractVideoFrame] Successfully extracted video frame');
            resolve(frameDataUrl);
          };
          
          // If we need to seek to a specific time
          if (Math.abs(videoElement.currentTime - seekTime) > 0.1) {
            // Define seeked handler (now it's properly assigned to the variable defined above)
            seekedHandler = () => handleSeek();
            
            // Add event listener for when seeking is complete
            videoElement.addEventListener('seeked', seekedHandler);
            
            // Start seeking
            videoElement.currentTime = seekTime;
          } else {
            // Already at a good position, just capture the frame
            handleSeek();
          }
        } catch (error) {
          console.error('[extractVideoFrame] Error extracting video frame:', error);
          reject(error);
        }
      });
    };
    
    // A simpler method to extract a frame without relying on seek events
    const extractSimpleFrame = (videoElement: HTMLVideoElement): string => {
      console.log('[extractSimpleFrame] Using direct frame capture');
      
      // Create a canvas with video dimensions
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || videoElement.clientWidth;
      canvas.height = videoElement.videoHeight || videoElement.clientHeight;
      
      // Get context and draw current frame
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get 2D context for simple frame extraction');
      }
      
      // Draw the video frame directly (use current frame whatever it is)
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Convert to data URL
      return canvas.toDataURL('image/jpeg', 0.85);
    };
    
    // Function to add the generate button next to a textarea
    function addGenerateButton(textarea: HTMLTextAreaElement) {
      if (textarea.dataset.geminiButtonAdded === 'true') return;
      console.log('[addGenerateButton] Starting for textarea:', textarea);

      const contextContainer = findComposerContainer(textarea);
      if (!contextContainer) {
          console.error('[addGenerateButton] Could not find the context container for the textarea. Button not added.');
          return; 
      }
      console.log('[addGenerateButton] Found context container for textarea:', contextContainer);
      
      let mediaSearchContainer: Element | null = null;
      if (contextContainer.matches('[aria-label="Video settings"]')) {
          console.log('[addGenerateButton] Context is "Video settings", searching document for [data-testid="composePostView"]...');
          mediaSearchContainer = document.querySelector('[data-testid="composePostView"]'); 
          if (!mediaSearchContainer) {
               console.error('[addGenerateButton] Context is "Video settings", but failed to find [data-testid="composePostView"] in the document for media search.');
               return; 
          } 
          console.log('[addGenerateButton] Context is "Video settings", found composePostView in document for media search:', mediaSearchContainer);
      } else {
          mediaSearchContainer = contextContainer;
          // Add specific log for GIF dialog
          if (contextContainer.matches('[role="dialog"][aria-label*="alt text" i]')) {
              console.log('[addGenerateButton] Context is "Add alt text" dialog (likely GIF), targeting dialog for media search:', mediaSearchContainer);
          } else {
              console.log('[addGenerateButton] Context is likely composePostView, targeting context container for media search:', mediaSearchContainer);
          }
      }
      
      // --- START: Refine button existence check ---
      // Check if a button ALREADY exists specifically near the textarea's parent
      const buttonAttachPoint = textarea.parentElement;
      if (!buttonAttachPoint) {
          console.error('[addGenerateButton] Could not find textarea parentElement to attach button or check for existing.');
          return; 
      }
      if (buttonAttachPoint.querySelector(`#${BUTTON_ID}`)) {
         console.log('[addGenerateButton] Button already exists near the textarea attach point, marking textarea and skipping UI creation.');
         textarea.dataset.geminiButtonAdded = 'true'; 
         return;
      }
      // --- END: Refine button existence check ---
      
      const buttonContainer = document.createElement('div');
      Object.assign(buttonContainer.style, {
          display: 'flex', alignItems: 'center', gap: '8px', 
          marginTop: '4px', 
          justifyContent: 'flex-end'
      });

      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text';
      const iconUrl = browser.runtime.getURL("/icons/gen-alt-text.svg"); 
      button.innerHTML = `<img src="${iconUrl}" alt="Generate Alt Text Icon" width="20" height="20" style="display: block;"><span style="margin-left: 6px;">Generate Alt Text</span>`;
      Object.assign(button.style, {
          marginLeft: '8px', padding: '6px 10px', cursor: 'pointer', border: '1px solid #ccc',
          borderRadius: '4px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '12px', fontWeight: '500'
      });

      const originalButtonContent = button.innerHTML; 

      // Add a styled progress bar to the button
      const createProgressContainer = () => {
        const container = document.createElement('div');
        Object.assign(container.style, {
          position: 'relative',
          width: '100%',
          height: '4px',
          backgroundColor: '#e0e0e0',
          borderRadius: '2px',
          overflow: 'hidden',
          marginTop: '4px'
        });
        
        const progressBar = document.createElement('div');
        Object.assign(progressBar.style, {
          position: 'absolute',
          height: '100%',
          width: '0%',
          backgroundColor: '#1da882',
          transition: 'width 0.3s ease-in-out',
          boxShadow: '0 0 3px rgba(29, 168, 130, 0.5)'
        });
        
        container.appendChild(progressBar);
        return { container, progressBar };
      };

      // Modified generateAltText function to include progress indicators
      const generateAltText = async () => {
        // Create and append progress container
        const { container: progressContainer, progressBar } = createProgressContainer();
        
        // Prepare the button for processing state
        button.innerHTML = '';
        button.disabled = true;
        
        // Create a status message element with better styling
        const statusMessage = document.createElement('div');
        Object.assign(statusMessage.style, {
          fontSize: '12px',
          fontWeight: '500',
          color: '#1da882',
          textAlign: 'center',
          width: '100%',
          whiteSpace: 'nowrap'
        });
        statusMessage.textContent = 'Finding Media...';
        
        // Clear button and add status message
        button.innerHTML = '';
        button.appendChild(statusMessage);
        
        // Ensure button has adequate width during processing
        const originalWidth = button.offsetWidth;
        const minWidth = Math.max(originalWidth, 100);
        Object.assign(button.style, {
          minWidth: `${minWidth}px`,
          padding: '6px 8px',
          backgroundColor: '#f9f9f9'
        });
        
        // Add progress bar to bottom of button
        buttonContainer.appendChild(progressContainer);
        
        // Update progress function
        const updateProgress = (percent, message) => {
          progressBar.style.width = `${percent}%`;
          statusMessage.textContent = message;
          
          // Change color based on progress type
          if (message.includes('Error')) {
            statusMessage.style.color = '#e74c3c';
          } else if (percent >= 90) {
            statusMessage.style.color = '#1da882'; // Success green
          } else if (percent >= 70) {
            statusMessage.style.color = '#3498db'; // Processing blue
          } else {
            statusMessage.style.color = '#f39c12'; // Progress orange
          }
        };
        
        // Start with initial progress
        updateProgress(5, 'Finding Media...');

        if (!mediaSearchContainer) {
            console.error('[generateAltText] mediaSearchContainer is null! Cannot search for media.');
            updateProgress(100, 'Error: Internal');
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                Object.assign(button.style, {
                    minWidth: '',
                    padding: '4px',
                    backgroundColor: '#f0f0f0'
                });
                button.disabled = false;
                buttonContainer.removeChild(progressContainer);
            }, 3000);
            return;
        }
        
        updateProgress(10, 'Searching...');
        console.log('[generateAltText] Searching for media within determined media search container:', mediaSearchContainer);
        const mediaElement = findMediaElement(mediaSearchContainer);
        
        console.log('[generateAltText] Media element found in search container:', mediaElement);

        if (!mediaElement || !(mediaElement instanceof HTMLImageElement || mediaElement instanceof HTMLVideoElement)) {
            console.error('[generateAltText] Could not find valid media element.');
            updateProgress(100, 'Error: No Media');
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                Object.assign(button.style, {
                    minWidth: '',
                    padding: '4px',
                    backgroundColor: '#f0f0f0'
                });
                button.disabled = false;
                buttonContainer.removeChild(progressContainer);
            }, 2000);
            return;
        }

        updateProgress(20, 'Processing Media...');
        button.style.color = '#000000'; 
        
        // Check if this is a large video 
        const isVideo = mediaElement.tagName === 'VIDEO';
        let isLargeVideo = false;
        
        if (isVideo) {
          try {
            // Estimate video size based on duration and dimensions
            const duration = mediaElement instanceof HTMLVideoElement ? mediaElement.duration : 0;
            const width = mediaElement.videoWidth || mediaElement.clientWidth;
            const height = mediaElement.videoHeight || mediaElement.clientHeight;
            
            // Heuristic to detect potentially large videos
            if (duration > 15 || (width * height > 1000000 && duration > 5)) { // > 15s or (> 1MP and > 5s)
              isLargeVideo = true;
              console.log('[generateAltText] Large video detected, may take longer to process');
              createToast('Processing large video. This may take several minutes...', 'info');
              updateProgress(25, 'Processing Large Video...');
            }
          } catch (e) {
            console.error('[generateAltText] Error checking video size:', e);
          }
        }
        
        updateProgress(30, 'Reading Media...');
        
        // Get the media source URL
        const mediaSource = await getMediaSource(mediaElement); 

        if (!mediaSource) {
          console.error('[generateAltText] Failed to get media source URL.');
          updateProgress(100, 'Error: Media Access Failed');
          createToast('Could not access media. Please try a different file.', 'error');
          
          setTimeout(() => { 
            button.innerHTML = originalButtonContent; 
            Object.assign(button.style, {
                minWidth: '',
                padding: '4px',
                backgroundColor: '#f0f0f0'
            });
            button.disabled = false;
            buttonContainer.removeChild(progressContainer);
          }, 3000);
          return;
        }
        
        console.log(`[generateAltText] Got ${isVideo ? 'Video' : 'Image'} source (type: ${mediaSource.substring(0, mediaSource.indexOf(':'))}, length: ${mediaSource.length})`);

        // Helper function to process media with all needed error handling
        const processWithMedia = async (mediaUrl: string, isVideoMedia: boolean, updateProgress, progressContainer) => {
          try {
            console.log('[processWithMedia] Connecting to background...');
            updateProgress(50, 'Connecting...');
            const port = browser.runtime.connect({ name: "altTextGenerator" });
            console.log('[processWithMedia] Connection established.');
            updateProgress(60, 'Preparing Media...');

            // Add a timeout to handle potential hanging requests
            const timeoutId = setTimeout(() => {
              console.error('[processWithMedia] Request timed out after 300 seconds');
              try {
                port.disconnect();
              } catch (e) { /* ignore */ }
              
              updateProgress(100, 'Error: Timeout');
              createToast('Request timed out. The media might be too large or complex to process.', 'error');
              
              setTimeout(() => {
                button.innerHTML = originalButtonContent;
                Object.assign(button.style, {
                    minWidth: '',
                    padding: '4px',
                    backgroundColor: '#f0f0f0'
                });
                button.disabled = false;
                buttonContainer.removeChild(progressContainer);
              }, 3000);
            }, 300000); // 5-minute timeout

            // For large files, we need to directly upload to server instead of using messaging
            const isLargeFile = mediaUrl.length > 1000000; // Roughly 1MB in base64
            
            if (isVideoMedia && isLargeFile) {
              console.log(`[processWithMedia] Media is large (${(mediaUrl.length / 1024 / 1024).toFixed(2)}MB), using direct upload method`);
              updateProgress(65, 'Processing Large Video...');
              
              // Extract basic information for the background script
              const basicInfo = {
                action: 'directUploadLargeMedia',
                mediaType: isVideoMedia ? 'video' : 'image',
                mimeType: mediaUrl.startsWith('data:') ? mediaUrl.split(';')[0].split(':')[1] : 'video/mp4',
                fileSize: mediaUrl.length
              };
              
              // Send only the metadata to the background script, not the full media
              port.postMessage(basicInfo);
              
              // Show progress animation during generation
              let progressVal = 65;
              const progressInterval = setInterval(() => {
                if (progressVal < 95) {
                  progressVal += isVideoMedia ? 1 : 3; // Slower for videos
                  updateProgress(progressVal, 'Generating...');
                }
              }, 1000);

              port.onMessage.addListener(async (response: any) => {
                // Handle the upload URL response
                if (response.uploadUrl) {
                  try {
                    updateProgress(70, 'Uploading Media...');
                    console.log('[processWithMedia] Received upload URL, sending media directly');
                    
                    // Extract the base64 data if this is a data URL
                    let base64Data = mediaUrl;
                    if (mediaUrl.startsWith('data:')) {
                      base64Data = mediaUrl.split(',')[1];
                    }
                    
                    // Convert base64 to blob for uploading
                    const byteCharacters = atob(base64Data);
                    const byteArrays = [];
                    const sliceSize = 1024;
                    
                    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                      const slice = byteCharacters.slice(offset, offset + sliceSize);
                      const byteNumbers = new Array(slice.length);
                      for (let i = 0; i < slice.length; i++) {
                        byteNumbers[i] = slice.charCodeAt(i);
                      }
                      const byteArray = new Uint8Array(byteNumbers);
                      byteArrays.push(byteArray);
                    }
                    
                    const blob = new Blob(byteArrays, {type: basicInfo.mimeType});
                    
                    // Send the media directly to the upload URL
                    const uploadResponse = await fetch(response.uploadUrl, {
                      method: 'PUT',
                      body: blob
                    });
                    
                    if (uploadResponse.ok) {
                      updateProgress(80, 'Media Uploaded');
                      
                      // Notify background that upload is complete
                      port.postMessage({
                        action: 'mediaUploadComplete',
                        uploadId: response.uploadId
                      });
                    } else {
                      throw new Error(`Upload failed with status ${uploadResponse.status}`);
                    }
                  } catch (uploadError) {
                    console.error('[processWithMedia] Upload error:', uploadError);
                    clearInterval(progressInterval);
                    clearTimeout(timeoutId);
                    updateProgress(100, 'Upload Error');
                    createToast(`Error uploading media: ${uploadError.message}`, 'error');
                    
                    setTimeout(() => {
                      button.innerHTML = originalButtonContent;
                      Object.assign(button.style, {
                        minWidth: '',
                        padding: '4px',
                        backgroundColor: '#f0f0f0'
                      });
                      button.disabled = false;
                      buttonContainer.removeChild(progressContainer);
                    }, 3000);
                    
                    try { port.disconnect(); } catch (e) { /* Ignore */ }
                  }
                } else if (response.altText) {
                  // Clear the interval and timeout
                  clearInterval(progressInterval);
                  clearTimeout(timeoutId);
                  
                  console.log('[processWithMedia] Msg from background:', response);
                  
                  updateProgress(100, '✓ Done');
                  textarea.value = response.altText;
                  textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  
                  // Always show toast now
                  createToast(
                    'Alt text generated! 🤖 Double-check it before posting, AI can make mistakes.',
                    'success', 
                    8000 
                  );
                  
                  // Update status message
                  if (!button.querySelector('div')) {
                    // Create status message element if it doesn't exist
                    const statusMessage = document.createElement('div');
                    Object.assign(statusMessage.style, {
                      fontSize: '12px',
                      fontWeight: '500',
                      textAlign: 'center',
                      width: '100%',
                      whiteSpace: 'nowrap',
                      color: '#1da882' // Success green
                    });
                    button.innerHTML = '';
                    button.appendChild(statusMessage);
                  }
                  
                  const statusMessage = button.querySelector('div');
                  statusMessage.textContent = '✓ Done';
                  statusMessage.style.color = '#1da882'; 
                  setTimeout(() => {
                      button.innerHTML = originalButtonContent;
                      Object.assign(button.style, {
                        minWidth: '',
                        padding: '4px',
                        backgroundColor: '#f0f0f0'
                      });
                      button.disabled = false;
                      buttonContainer.removeChild(progressContainer);
                  }, 1500);
                  
                  try { port.disconnect(); } catch (e) { /* Ignore */ }
                } else if (response.error) {
                  // Handle error response
                  clearInterval(progressInterval);
                  clearTimeout(timeoutId);
                  
                  const errorMsg = typeof response.error === 'string' ? response.error : 'Unknown error';
                  updateProgress(100, `Error: ${errorMsg.substring(0, 20)}...`);
                  createToast(`Error: ${errorMsg}`, 'error');
                  
                  // Update status message
                  if (!button.querySelector('div')) {
                    // Create status message element if it doesn't exist
                    const statusMessage = document.createElement('div');
                    Object.assign(statusMessage.style, {
                      fontSize: '12px',
                      fontWeight: '500',
                      textAlign: 'center',
                      width: '100%',
                      whiteSpace: 'nowrap'
                    });
                    button.innerHTML = '';
                    button.appendChild(statusMessage);
                  }
                  
                  const statusMessage = button.querySelector('div');
                  statusMessage.textContent = `Error: ${errorMsg.substring(0, 20)}...`;
                  statusMessage.style.color = '#e74c3c'; // Error red 
                  setTimeout(() => {
                      button.innerHTML = originalButtonContent;
                      button.style.color = ''; 
                      button.disabled = false;
                      buttonContainer.removeChild(progressContainer);
                  }, 3000);
                  
                  try { port.disconnect(); } catch (e) { /* Ignore */ }
                }
              });
              
              port.onDisconnect.addListener(() => {
                // Clear the interval
                clearInterval(progressInterval);
                
                const lastError = browser.runtime.lastError;
                console.error('[processWithMedia] Port disconnected.', lastError || '(No error info)');
                const currentText = button.textContent;
                if (currentText && !currentText.includes('Done') && !currentText.includes('Error')) {
                  updateProgress(100, 'Disconnect Err');
                  button.style.color = '#000000'; 
                  setTimeout(() => { 
                      button.innerHTML = originalButtonContent; 
                      button.style.color = ''; 
                      button.disabled = false;
                      buttonContainer.removeChild(progressContainer);
                  }, 3000);
                }
              });
              
              return; // Exit early, we're handling through the direct upload flow
            }
            
            // Standard flow for smaller files
            updateProgress(60, 'Generating...');
            
            // Show progress animation during generation
            let progressVal = 60;
            const progressInterval = setInterval(() => {
              if (progressVal < 95) {
                progressVal += isVideoMedia ? 1 : 3; // Slower for videos
                updateProgress(progressVal, 'Generating...');
              }
            }, 1000);

            port.onMessage.addListener((response: any) => {
              // Clear the interval and timeout
              clearInterval(progressInterval);
              clearTimeout(timeoutId);
              
              console.log('[processWithMedia] Msg from background:', response);
              let statusText = '';
              let isError = false;
              
              if (response.altText) {
                updateProgress(100, '✓ Done');
                textarea.value = response.altText;
                textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                statusText = '✓ Done';
                // Always show toast now
                createToast(
                  'Alt text generated! 🤖 Double-check it before posting, AI can make mistakes.',
                  'success', 
                  8000 
                );
              } else if (response.error) {
                const errorMsg = typeof response.error === 'string' ? response.error : 'Unknown error';
                statusText = `Error: ${errorMsg.substring(0, 20)}...`;
                updateProgress(100, statusText);
                isError = true;
                // Show error toast
                createToast(`Error: ${errorMsg}`, 'error'); 
              } else {
                statusText = 'Msg Format Err';
                updateProgress(100, statusText);
                isError = true;
                console.error('[processWithMedia] Unexpected message format:', response);
              }
              
              if (!button.querySelector('div')) {
                // Create status message element if it doesn't exist
                const statusMessage = document.createElement('div');
                Object.assign(statusMessage.style, {
                  fontSize: '12px',
                  fontWeight: '500',
                  textAlign: 'center',
                  width: '100%',
                  whiteSpace: 'nowrap'
                });
                button.innerHTML = '';
                button.appendChild(statusMessage);
              }
              
              // Update the status message
              const statusMessage = button.querySelector('div');
              statusMessage.textContent = statusText;
              
              // Set color based on status
              if (isError) {
                statusMessage.style.color = '#e74c3c'; // Error red
              } else {
                statusMessage.style.color = '#1da882'; // Success green
              } 
              setTimeout(() => {
                  button.innerHTML = originalButtonContent;
                  Object.assign(button.style, {
                    minWidth: '',
                    padding: '6px 10px',
                    backgroundColor: '#f0f0f0'
                  });
                  button.disabled = false;
                  buttonContainer.removeChild(progressContainer);
              }, isError ? 3000 : 1500);
              
              try { port.disconnect(); } catch (e) { /* Ignore */ }
            });

            port.onDisconnect.addListener(() => {
              // Clear the interval
              clearInterval(progressInterval);
              
              const lastError = browser.runtime.lastError;
              console.error('[processWithMedia] Port disconnected.', lastError || '(No error info)');
              const currentText = button.textContent;
              if (currentText && !currentText.includes('Done') && !currentText.includes('Error')) {
                updateProgress(100, 'Disconnect Err');
                button.style.color = '#000000'; 
                setTimeout(() => { 
                    button.innerHTML = originalButtonContent; 
                    Object.assign(button.style, {
                      minWidth: '',
                      padding: '4px',
                      backgroundColor: '#f0f0f0'
                    });
                    button.disabled = false;
                    buttonContainer.removeChild(progressContainer);
                }, 3000);
              }
            });

            // Send the message for smaller files
            console.log('[processWithMedia] Sending message...');
            port.postMessage({ 
              action: 'generateAltText', 
              mediaUrl: mediaUrl, 
              isVideo: isVideoMedia,
              fileSize: mediaUrl.length // Estimate of file size for backend processing
            }); 
            console.log('[processWithMedia] Message sent.');
          } catch (error: unknown) {
            console.error('[processWithMedia] Connect/Post error:', error);
            let errorMessage = 'Connect Error';
            
            // Check for message length exceeded error
            if (error instanceof Error && error.message.includes('Message length exceeded maximum allowed length')) {
              errorMessage = 'Size Error';
              updateProgress(100, errorMessage);
              createToast('Media size exceeds maximum allowed by browser. Please try a smaller or lower resolution file.', 'error');
            }
            
            button.textContent = errorMessage;
            button.style.color = '#000000'; 
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                Object.assign(button.style, {
                    minWidth: '',
                    padding: '6px 10px',
                    backgroundColor: '#f0f0f0'
                });
                button.disabled = false;
                buttonContainer.removeChild(progressContainer);
            }, 3000);
          }
        };
        
        // Start processing with the media we found
        await processWithMedia(mediaSource, isVideo, updateProgress, progressContainer);
      };
      
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        generateAltText();
      });

      // Add the button to its container
      buttonContainer.appendChild(button);

      // --- START: Modify Button Insertion Again ---
      // Insert the container after the textarea's parent element (like the old version)
      buttonAttachPoint.insertAdjacentElement('afterend', buttonContainer);
      // --- END: Modify Button Insertion Again ---
      textarea.dataset.geminiButtonAdded = 'true';
      console.log('[addGenerateButton] Button added successfully after textarea parent:', buttonAttachPoint);
    }

    // --- Simplified Manual Mode Observer ---
    let manualModeObserver: MutationObserver | null = null;
    const observeAltTextAreas = () => {
      if (manualModeObserver) manualModeObserver.disconnect(); 
      console.log('[observeAltTextAreas] Starting observer for manual button injection.');
      
      document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);

      manualModeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node instanceof HTMLElement) {
                if (node.matches(ALT_TEXT_SELECTOR)) {
                   addGenerateButton(node as HTMLTextAreaElement);
                }
                node.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR)
                  .forEach(addGenerateButton);
              }
            });
          }
          if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && mutation.target.matches(ALT_TEXT_SELECTOR)) {
             addGenerateButton(mutation.target as HTMLTextAreaElement);
          }
        }
      });

      manualModeObserver.observe(document.body, { 
          childList: true, 
          subtree: true, 
          attributes: true, 
          attributeFilter: ['aria-label', 'placeholder', 'data-testid', 'role'] 
      });
      console.log('[observeAltTextAreas] Observer attached to document body.');
    };
    // --- END: Simplified Manual Mode Observer ---
    
    // --- Start Observer Directly ---
    // Ensure DOM is ready before starting
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeAltTextAreas);
    } else {
        observeAltTextAreas();
    }
    // --- END: Start Observer Directly ---
    
    console.log('Bluesky Alt Text Generator content script setup complete.');
  },
});