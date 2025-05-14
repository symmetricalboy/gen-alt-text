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
            
            // For large videos, extract a representative frame instead of processing the entire video
            if (mediaElement instanceof HTMLVideoElement && blob.size > 5000000) { // 5MB threshold
              console.log('[getMediaSource] Large video detected, extracting representative frame');
              try {
                return await extractVideoFrame(mediaElement);
              } catch (frameError) {
                console.error('[getMediaSource] Error extracting video frame, trying direct capture:', frameError);
                // Fall back to direct frame capture without seeking
                return extractSimpleFrame(mediaElement);
              }
            }
            
            // Normal processing for smaller videos and images
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (fetchError) {
            console.error('[getMediaSource] Error fetching or converting blob URL:', fetchError);
            
            // If this is a video, try to extract a frame directly as a last resort
            if (mediaElement instanceof HTMLVideoElement) {
              console.log('[getMediaSource] Trying direct frame extraction as fallback');
              return extractSimpleFrame(mediaElement);
            }
            
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
      button.innerHTML = `<img src="${iconUrl}" alt="Generate Alt Text Icon" width="20" height="20" style="display: block;">`;
      Object.assign(button.style, {
          marginLeft: '8px', padding: '4px', cursor: 'pointer', border: '1px solid #ccc',
          borderRadius: '4px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center',
          justifyContent: 'center'
      });

      const originalButtonContent = button.innerHTML; 

      const generateAltText = async () => {
        button.innerHTML = '';
        button.textContent = 'Finding Media...';
        button.style.color = '#000000'; 
        button.disabled = true;

        if (!mediaSearchContainer) {
            console.error('[generateAltText] mediaSearchContainer is null! Cannot search for media.');
            button.textContent = 'Error: Internal';
            button.style.color = '#000000'; 
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; 
                button.disabled = false; 
            }, 3000);
            return;
        }
        console.log('[generateAltText] Searching for media within determined media search container:', mediaSearchContainer);
        const mediaElement = findMediaElement(mediaSearchContainer);
        
        console.log('[generateAltText] Media element found in search container:', mediaElement);

        if (!mediaElement || !(mediaElement instanceof HTMLImageElement || mediaElement instanceof HTMLVideoElement)) {
            console.error('[generateAltText] Could not find valid media element.');
            button.textContent = 'Error: No Media';
            button.style.color = '#000000'; 
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; 
                button.disabled = false; 
            }, 2000);
            return;
        }

        button.textContent = 'Processing Media...';
        button.style.color = '#000000'; 
        
        // Check if this is a large video that might cause issues
        const isVideo = mediaElement.tagName === 'VIDEO';
        let isLargeVideo = false;
        
        if (isVideo) {
          try {
            // Estimate video size based on duration and dimensions
            const duration = mediaElement instanceof HTMLVideoElement ? mediaElement.duration : 0;
            const width = mediaElement.videoWidth || mediaElement.clientWidth;
            const height = mediaElement.videoHeight || mediaElement.clientHeight;
            
            // Heuristic to detect potentially problematic videos
            if (duration > 15 || (width * height > 1000000 && duration > 5)) { // > 15s or (> 1MP and > 5s)
              isLargeVideo = true;
              console.log('[generateAltText] Large video detected, using optimized processing');
              createToast('Processing large video. This may take a moment...', 'info');
            }
          } catch (e) {
            console.error('[generateAltText] Error checking video size:', e);
          }
        }
        
        // Get the media source URL (could be data:, blob: converted to data:, or http(s):)
        const mediaSource = await getMediaSource(mediaElement); 

        if (!mediaSource) {
             console.error('[generateAltText] Failed to get media source URL.');
             button.textContent = 'Error: Process Fail';
             button.style.color = '#000000';
             
             // For videos, provide more helpful messaging about frame extraction
             if (isVideo) {
               createToast('Failed to process video. Trying to extract a single frame...', 'warning');
               
               // Last-ditch effort: try direct frame extraction
               if (mediaElement instanceof HTMLVideoElement) {
                 try {
                   button.textContent = 'Extracting Frame...';
                   // Skip the async version and go straight to the simple method
                   const frameDataUrl = extractSimpleFrame(mediaElement);
                   
                   // Continue with the extracted frame
                   await processWithMedia(frameDataUrl, true, true);
                   return;
                 } catch (lastError) {
                   console.error('[generateAltText] Final frame extraction attempt failed:', lastError);
                   createToast('Could not process video. Try a different clip or upload a still image.', 'error');
                 }
               }
             }
             
             setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; 
                button.disabled = false; 
             }, 3000);
             return;
        }
        
        console.log(`[generateAltText] Got ${isVideo ? 'Video' : 'Image'} source (type: ${mediaSource.substring(0, mediaSource.indexOf(':'))}, length: ${mediaSource.length})`);

        // Helper function to process media with all needed error handling
        const processWithMedia = async (mediaUrl: string, isVideoMedia: boolean, isFrameOnly = false) => {
          try {
            console.log('[processWithMedia] Connecting to background...');
            button.textContent = 'Connecting...';
            button.style.color = '#000000'; 
            const port = browser.runtime.connect({ name: "altTextGenerator" });
            console.log('[processWithMedia] Connection established.');
            button.textContent = 'Generating...';
            button.style.color = '#000000';

            // Add a timeout to handle potential hanging requests
            const timeoutId = setTimeout(() => {
              console.error('[processWithMedia] Request timed out after 60 seconds');
              try {
                port.disconnect();
              } catch (e) { /* ignore */ }
              
              button.textContent = 'Error: Timeout';
              button.style.color = '#000000';
              createToast('Request timed out. The media might be too large or complex to process.', 'error');
              
              setTimeout(() => {
                button.innerHTML = originalButtonContent;
                button.style.color = '';
                button.disabled = false;
              }, 3000);
            }, 60000); // 60-second timeout

            port.onMessage.addListener((response: any) => {
              // Clear the timeout since we got a response
              clearTimeout(timeoutId);
              
              console.log('[processWithMedia] Msg from background:', response);
              let statusText = '';
              let isError = false;
              
              if (response.altText) {
                textarea.value = response.altText;
                textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                statusText = '✓ Done';
                // Always show toast now
                if (isFrameOnly) {
                  createToast(
                    'Alt text generated from a frame of your video! 🤖 Double-check it before posting.',
                    'success', 
                    8000 
                  );
                } else {
                  createToast(
                    'Alt text generated! 🤖 Double-check it before posting, AI can make mistakes.',
                    'success', 
                    8000 
                  );
                }
              } else if (response.error) {
                const errorMsg = typeof response.error === 'string' ? response.error : 'Unknown error';
                statusText = `Error: ${errorMsg.substring(0, 20)}...`;
                isError = true;
                // Show error toast
                createToast(`Error: ${errorMsg}`, 'error'); 
              } else {
                statusText = 'Msg Format Err';
                isError = true;
                console.error('[processWithMedia] Unexpected message format:', response);
              }
              
              button.textContent = statusText;
              button.style.color = '#000000'; 
              setTimeout(() => {
                  button.innerHTML = originalButtonContent;
                  button.style.color = ''; 
                  button.disabled = false;
              }, isError ? 3000 : 1500);
              
              try { port.disconnect(); } catch (e) { /* Ignore */ }
            });

            port.onDisconnect.addListener(() => {
              const lastError = browser.runtime.lastError;
              console.error('[processWithMedia] Port disconnected.', lastError || '(No error info)');
              const currentText = button.textContent;
              if (currentText && !currentText.includes('Done') && !currentText.includes('Error')) {
                button.textContent = 'Disconnect Err';
                button.style.color = '#000000'; 
                setTimeout(() => { 
                    button.innerHTML = originalButtonContent; 
                    button.style.color = ''; 
                    button.disabled = false; 
                }, 3000);
              }
            });

            // Send the message
            console.log('[processWithMedia] Sending message...');
            port.postMessage({ 
              action: 'generateAltText', 
              mediaUrl: mediaUrl, 
              isVideo: isVideoMedia,
              isLargeVideo: isLargeVideo || isFrameOnly,
              isFrameOnly: isFrameOnly
            }); 
            console.log('[processWithMedia] Message sent.');
          } catch (error: unknown) {
            console.error('[processWithMedia] Connect/Post error:', error);
            let errorMessage = 'Connect Error';
            
            // Check for message length exceeded error
            if (error instanceof Error && error.message.includes('Message length exceeded maximum allowed length')) {
              errorMessage = 'Size Error';
              
              // Only try further fallbacks if we're not already working with a frame
              if (!isFrameOnly && isVideoMedia) {
                createToast('Video too large. Extracting just a frame...', 'info');
                
                try {
                  if (mediaElement instanceof HTMLVideoElement) {
                    button.textContent = 'Extracting Frame...';
                    
                    // Skip straight to the simple method for reliability
                    const frameDataUrl = extractSimpleFrame(mediaElement);
                    
                    // Process with the frame instead
                    button.textContent = 'Retrying...';
                    await processWithMedia(frameDataUrl, true, true);
                    return;
                  }
                } catch (frameError) {
                  console.error('[processWithMedia] Frame extraction fallback failed:', frameError);
                  errorMessage = 'Extract Error';
                  createToast('Could not process video. Please try a different clip.', 'error');
                }
              } else {
                // Already using a frame and still too big
                createToast('Media size exceeds maximum allowed. Please try a smaller or lower resolution clip.', 'error');
              }
            }
            
            button.textContent = errorMessage;
            button.style.color = '#000000'; 
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; 
                button.disabled = false; 
            }, 3000);
          }
        };
        
        // Start processing with the media we found
        await processWithMedia(mediaSource, isVideo, false);
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