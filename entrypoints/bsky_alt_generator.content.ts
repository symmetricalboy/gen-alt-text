import iconUrl from '/icons/gen-alt-text-white.svg';

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
    const CAPTION_BUTTON_ID = 'gemini-caption-button';
    
    // Define the mutation observer
    let manualModeObserver: MutationObserver | null = null;
    
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
      
      const colors = { success: '#208bfe', error: '#e53935', warning: '#f59f0b', info: '#007eda' };
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
      
      // Add stronger video-specific selectors first
      const selectors: string[] = [
        // Video-specific selectors first for better video detection
        '[data-testid="videoPreview"] video[src]',
        '[data-testid="videos"] video[src]',
        '[data-testid="videoPreview"] video source[src]',
        '[data-testid="videos"] video source[src]',
        // More general video selectors
        'video[src]',
        'video source[src]',
        // Image selectors
        '[data-testid="imagePreview"] img[src]', 
        '[data-testid="images"] img[src]',
        'img[src]:not([alt*="avatar" i]):not([src*="avatar"])' 
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
                      console.log('[findMediaElement] Found video via source element:', videoParent);
                      visibleElements.push(videoParent);
                  }
              } else if (element && isElementVisible(element) && !visibleElements.includes(element)) {
                  console.log('[findMediaElement] Found media element:', element);
                  visibleElements.push(element);
              }
          });
      }

      if (visibleElements.length > 0) {
          // Prioritize video elements if any are found
          const videoElements = visibleElements.filter(el => el instanceof HTMLVideoElement);
          if (videoElements.length > 0) {
              const video = videoElements[videoElements.length - 1];
              console.log('[findMediaElement] Found video element:', video);
              return video;
          }
          
          // Otherwise, use the last element found (likely the most recently added)
          const lastElement = visibleElements[visibleElements.length - 1];
          console.log(`[findMediaElement] Found ${visibleElements.length} media elements, using the last one:`, lastElement);
          return lastElement;
      }

      console.error('[findMediaElement] FAILED: No suitable media found using direct selectors.');
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
      
      const icon = document.createElement('img');
      try {
        // Pass the imported relative path to getURL()
        icon.src = browser.runtime.getURL(iconUrl);
      } catch (e) {
        console.error('[addGenerateButton] Error getting FULL icon URL:', e, 'Original iconUrl was:', iconUrl);
      }
      icon.alt = 'AI';
      Object.assign(icon.style, {
        width: '16px',
        height: '16px',
        marginRight: '6px'
      });

      button.innerHTML = '';
      button.appendChild(icon);
      button.appendChild(document.createTextNode('Generate Alt Text'));
      
      Object.assign(button.style, {
          marginLeft: '8px',
          padding: '8px 16px', 
          cursor: 'pointer',
          border: 'none',
          borderRadius: '8px',
          backgroundColor: '#208bfe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          color: 'white'
      });

      // Store original style for quick reference
      const originalText = button.textContent;
      const originalBackgroundColor = button.style.backgroundColor;
      const originalCursor = button.style.cursor;
      // Add any other styles here if they are changed during processing
      
      let isRunning = false; // Declare isRunning here

      // Helper to find the alt text area (assuming it's the one passed to addGenerateButton)
      const getAltTextArea = (): HTMLTextAreaElement => {
        return textarea;
      };

      // Helper function to generate and fill alt text
      const generateAndFillAltText = async (targetTextArea: HTMLTextAreaElement) => {
        if (!mediaSearchContainer) {
            console.error('[generateAndFillAltText] mediaSearchContainer is null! Cannot search for media.');
            createToast('Error: Internal error finding media container.', 'error');
            return;
        }
        
        console.log('[generateAndFillAltText] Searching for media within determined media search container:', mediaSearchContainer);
        const mediaElement = findMediaElement(mediaSearchContainer);
        
        console.log('[generateAndFillAltText] Media element found in search container:', mediaElement);

        if (!mediaElement || !(mediaElement instanceof HTMLImageElement || mediaElement instanceof HTMLVideoElement)) {
            console.error('[generateAndFillAltText] Could not find valid media element.');
            createToast('Error: No media found to generate alt text for.', 'error');
            return;
        }

        const isVideo = mediaElement.tagName === 'VIDEO';
        
        let isLargeVideo = false;
        if (isVideo && mediaElement instanceof HTMLVideoElement) {
          try {
            const duration = mediaElement.duration || 0;
            const width = mediaElement.videoWidth || mediaElement.clientWidth;
            const height = mediaElement.videoHeight || mediaElement.clientHeight;
            if (duration > 15 || (width * height > 1000000 && duration > 5)) {
              isLargeVideo = true;
              console.log('[generateAndFillAltText] Large video detected.');
              createToast('Processing large video. This may take several minutes...', 'info');
            }
          } catch (e) {
            console.error('[generateAndFillAltText] Error checking video size:', e);
          }
        }
        
        const mediaSource = await getMediaSource(mediaElement); 

        if (!mediaSource) {
          console.error('[generateAndFillAltText] Failed to get media source URL.');
          createToast('Could not access media. Please try a different file.', 'error');
          return;
        }
        
        console.log(`[generateAndFillAltText] Got ${isVideo ? 'Video' : 'Image'} source (type: ${mediaSource.substring(0, mediaSource.indexOf(':'))}, length: ${mediaSource.length})`);

        return new Promise<void>((resolve, reject) => {
            const port = browser.runtime.connect({ name: "altTextGenerator" });
            
            const timeoutId = setTimeout(() => {
              console.error('[generateAndFillAltText] Request timed out after 300 seconds');
              try { port.disconnect(); } catch (e) { /* ignore */ }
              createToast('Request timed out. The media might be too large or complex to process.', 'error');
              reject(new Error('Request timed out'));
            }, 300000); // 5-minute timeout

            port.onMessage.addListener((response: any) => {
              clearTimeout(timeoutId);
              console.log('[generateAndFillAltText] Msg from background:', response);
              if (response.altText) {
                targetTextArea.value = response.altText;
                targetTextArea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                createToast('Alt text generated! 🤖 Double-check it before posting, AI can make mistakes.', 'success', 8000);
                resolve();
              } else if (response.error) {
                const errorMsg = typeof response.error === 'string' ? response.error : 'Unknown error';
                
                // Check for size-related error messages and standardize them
                if (errorMsg.toLowerCase().includes('too large') || 
                    errorMsg.toLowerCase().includes('413') || 
                    errorMsg.toLowerCase().includes('request entity too large') ||
                    errorMsg.toLowerCase().includes('payload too large') ||
                    errorMsg.toLowerCase().includes('message length exceeded') ||
                    errorMsg.toLowerCase().includes('size limit')) {
                  createToast('Server error: File exceeds size limits (max 20MB). Please use a smaller file.', 'error');
                } else {
                  createToast(`Error: ${errorMsg}`, 'error');
                }
                
                reject(new Error(errorMsg));
              } else {
                createToast('Unexpected message format from background script.', 'error');
                reject(new Error('Unexpected message format'));
              }
              try { port.disconnect(); } catch (e) { /* Ignore */ }
            });

            port.onDisconnect.addListener(() => {
              clearTimeout(timeoutId);
              const lastError = browser.runtime.lastError;
              if (lastError) {
                console.error('[generateAndFillAltText] Port disconnected with error:', lastError);
                createToast(`Connection error: ${lastError.message || 'Unknown connection error'}`, 'error');
                reject(new Error(lastError.message || 'Port disconnected'));
              }
            });
            
            // Check for large files and use direct upload if necessary
            const isLargeFile = mediaSource.length > 1000000; // Roughly 1MB in base64
            if (isVideo && isLargeFile) {
                 // This section was complex and seems to be part of a previous approach.
                 // For now, we'll simplify and send all media directly through the port.
                 // If issues persist with large videos, this direct upload logic might need to be revisited.
                 console.log('[generateAndFillAltText] Large video detected, sending through standard port message.');
            }

            console.log('[generateAndFillAltText] Sending message to background script...');
            port.postMessage({ 
              action: 'generateAltText', 
              mediaUrl: mediaSource, 
              isVideo: isVideo,
              fileSize: mediaSource.length 
            }); 
            console.log('[generateAndFillAltText] Message sent.');
        });
      };
      
      // Add click event listener
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Early return if already running
        if (isRunning) {
          console.log("[GeminiAltText] Generation already in progress");
          return;
        }
        
        // Find the text area, skip if not found
        const textArea = getAltTextArea();
        if (!textArea) {
          createToast('Could not find alt text field', 'error');
          return;
        }
        
        // Check if there's already content in the text area
        if (textArea.value && textArea.value.trim().length > 0) {
          if (!confirm('This will replace existing alt text. Continue?')) {
            return;
          }
        }
        
        // Enter running state
        isRunning = true;
        
        // Update button to show "Generating..."
        button.textContent = 'Generating...';
        button.style.backgroundColor = '#175da8';
        button.style.cursor = 'wait';
        
        try {
          await generateAndFillAltText(textArea);
        } catch (error) {
          createToast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
          console.error('[GeminiAltText] Generation error:', error);
        } finally {
          // Reset button style and text
          button.textContent = originalText;
          button.style.backgroundColor = originalBackgroundColor;
          button.style.cursor = originalCursor;
          isRunning = false;
        }
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

    // Find video caption section in dialog
    const findCaptionSection = (): HTMLElement | null => {
      console.log('[findCaptionSection] Searching for Video settings dialog...');
      
      // First find the dialog that contains captions section
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
      console.log('[findCaptionSection] Found', dialogs.length, 'dialogs on the page');
      
      // Log all dialogs for debugging
      dialogs.forEach((dialog, index) => {
        console.log(`[findCaptionSection] Dialog ${index}:`, dialog.getAttribute('aria-label'), dialog);
      });
      
      // More permissive selection criteria - any dialog that might be related to video
      const videoDialogs = dialogs.filter(
        el => {
          const label = el.getAttribute('aria-label');
          return label && (
            label.includes('Video') || 
            label.includes('video') || 
            label.includes('Media') || 
            label.includes('media') ||
            label.includes('Post') ||
            label.includes('Settings')
          );
        }
      );
      
      if (videoDialogs.length === 0) {
        console.log('[findCaptionSection] Could not find any potential Video dialogs');
        return null;
      }
      
      console.log('[findCaptionSection] Found potential video dialogs:', videoDialogs);
      
      // Try each dialog
      for (const dialog of videoDialogs) {
        console.log('[findCaptionSection] Examining dialog:', dialog);
        
        // Look for the "Captions (.vtt)" header or any caption-related text
        // More permissive search for any element mentioning captions
        const captionHeaders = Array.from(dialog.querySelectorAll('div, span, label, p, h1, h2, h3, h4, h5, h6'))
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('caption') || 
                   text.includes('.vtt') || 
                   text.includes('subtitle') ||
                   text.includes('cc');
          });
        
        if (captionHeaders.length > 0) {
          console.log('[findCaptionSection] Found caption-related elements in dialog:', captionHeaders);
          
          // Get the section that contains the caption UI
          const captionHeader = captionHeaders[0];
          
          // Find the parent container that wraps the captions section
          // Look up several levels to ensure we find a suitable container
          let captionSection = captionHeader;
          
          // Look for a container with file input or buttons - likely the real control section
          for (let i = 0; i < 5; i++) {
            // Check if current element or any descendant has a file input or button
            if (captionSection.querySelector('input[type="file"], button') ||
                (captionSection instanceof HTMLElement && 
                 (captionSection.querySelector('[role="button"]') || 
                  captionSection.style.display === 'flex'))) {
              console.log('[findCaptionSection] Found suitable caption control section:', captionSection);
              return captionSection as HTMLElement;
            }
            
            // Move up to parent
            if (!captionSection.parentElement) break;
            captionSection = captionSection.parentElement;
          }
          
          // Fallback - use the original caption section we found
          console.log('[findCaptionSection] Using fallback caption section:', captionSection);
          return captionSection as HTMLElement;
        }
      }
      
      console.log('[findCaptionSection] No caption section found in any dialog');
      return null;
    };
    
    // Function to add the generate captions button
    const addGenerateCaptionsButton = () => {
      console.log('[addGenerateCaptionsButton] Attempting to add Generate Captions button...');
      
      const captionSection = findCaptionSection();
      if (!captionSection) {
        console.log('[addGenerateCaptionsButton] No caption section found, skipping button creation');
        return;
      }
      console.log('[addGenerateCaptionsButton] Found caption section:', captionSection);

      if (captionSection.querySelector(`#${CAPTION_BUTTON_ID}`)) {
        console.log('[addGenerateCaptionsButton] Button already exists');
        return;
      }
      
      // Try to find an appropriate insertion point with multiple strategies
      let buttonContainer: HTMLElement | Element | null = null; // Allow Element type
      
      // Strategy 1: Look for a div with flex-direction: row
      buttonContainer = captionSection.querySelector('div[style*="flex-direction: row"], div[style*="flex-direction:row"]');
      if (buttonContainer) {
        console.log('[addGenerateCaptionsButton] Strategy 1: Found flex row container:', buttonContainer);
      }
      
      // Strategy 2: Look for any div containing a button or file input
      if (!buttonContainer) {
        const buttonContainers = Array.from(captionSection.querySelectorAll('div')).filter(
          el => el.querySelector('button, input[type="file"]')
        );
        if (buttonContainers.length > 0) {
          buttonContainer = buttonContainers[0];
          console.log('[addGenerateCaptionsButton] Strategy 2: Found container with buttons:', buttonContainer);
        }
      }
      
      // Strategy 3: Look for elements with display:flex that might be button rows
      if (!buttonContainer) {
        const flexContainers = Array.from(captionSection.querySelectorAll('div[style*="display: flex"], div[style*="display:flex"]'));
        if (flexContainers.length > 0) {
          buttonContainer = flexContainers[0];
          console.log('[addGenerateCaptionsButton] Strategy 3: Found flex container:', buttonContainer);
        }
      }
      
      // If we still couldn't find the button container, create a new one
      if (!buttonContainer) {
        console.log('[addGenerateCaptionsButton] No suitable container found, creating a new one');
        buttonContainer = document.createElement('div');
        
        const parent = captionSection.parentElement;
        if (parent && parent.firstElementChild) {
          buttonContainer.className = parent.firstElementChild.className;
        }
        
        (buttonContainer as HTMLElement).style.flexDirection = 'row';
        (buttonContainer as HTMLElement).style.display = 'flex';
        (buttonContainer as HTMLElement).style.gap = '10px';
        (buttonContainer as HTMLElement).style.marginTop = '10px';
        captionSection.appendChild(buttonContainer);
      } else {
        (buttonContainer as HTMLElement).style.display = 'flex';
        (buttonContainer as HTMLElement).style.flexDirection = 'row';
        (buttonContainer as HTMLElement).style.gap = '10px';
      }
      
      console.log('[addGenerateCaptionsButton] Using button container:', buttonContainer);
      
      const existingButton = captionSection.querySelector('button[aria-label*="subtitle file"]') || 
                             captionSection.querySelector('button') ||
                             document.querySelector('button[aria-label*="file"]') ||
                             document.querySelector('[role="button"]');
      
      console.log('[addGenerateCaptionsButton] Found existing button to style from:', existingButton);
      
      const button = document.createElement('button');
      button.id = CAPTION_BUTTON_ID;
      const icon = document.createElement('img');
      try {
        // Pass the imported relative path to getURL()
        icon.src = browser.runtime.getURL(iconUrl);
      } catch (e) {
        console.error('[addGenerateCaptionsButton] Error getting FULL icon URL:', e, 'Original iconUrl was:', iconUrl);
      }
      icon.alt = 'AI';
      Object.assign(icon.style, {
        width: '16px',
        height: '16px',
        marginRight: '6px'
      });
      
      // Clear existing content and add icon and text
      button.innerHTML = ''; // Clear any previous textContent
      button.appendChild(icon);
      button.appendChild(document.createTextNode('Generate Captions'));
      
      button.setAttribute('aria-label', 'Generate captions using AI');
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      
      if (existingButton) {
        button.className = existingButton.className;
        const computedStyle = window.getComputedStyle(existingButton);
        Object.assign(button.style, {
          flexDirection: computedStyle.flexDirection,
          alignItems: computedStyle.alignItems,
          justifyContent: computedStyle.justifyContent,
          padding: computedStyle.padding,
          borderRadius: computedStyle.borderRadius,
          gap: computedStyle.gap,
          border: computedStyle.border,
          cursor: computedStyle.cursor,
          height: computedStyle.height,
          fontFamily: computedStyle.fontFamily,
          fontSize: computedStyle.fontSize,
          lineHeight: computedStyle.lineHeight,
          backgroundColor: '#208bfe',
          color: 'white',
          fontWeight: 'bold',
          marginLeft: '10px'
        });
      } else {
        Object.assign(button.style, {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#208bfe',
          padding: '13px 20px',
          borderRadius: '8px',
          gap: '8px',
          color: 'white',
          fontWeight: 'bold',
          border: 'none',
          cursor: 'pointer',
          marginLeft: '10px'
        });
      }
      
      button.addEventListener('click', generateCaptions);
      
      // --- Precise Button Placement --- 
      const subtitleButtonForPlacement = captionSection.querySelector('button[aria-label*="subtitle" i]') as HTMLElement;

      if (subtitleButtonForPlacement && subtitleButtonForPlacement.parentElement) {
        console.log('[addGenerateCaptionsButton] Precise placement: Inserting button after the found subtitle button:', subtitleButtonForPlacement);
        subtitleButtonForPlacement.insertAdjacentElement('afterend', button);
      } else if (buttonContainer instanceof HTMLElement) {
        console.log('[addGenerateCaptionsButton] Fallback placement: Appending to identified buttonContainer.');
        buttonContainer.appendChild(button);
      } else if (buttonContainer && typeof (buttonContainer as any).appendChild === 'function'){
        console.log('[addGenerateCaptionsButton] Fallback placement: Appending to Element (buttonContainer).');
        (buttonContainer as Element).appendChild(button); // Cast to Element if it has appendChild
      } else {
        console.error('[addGenerateCaptionsButton] CRITICAL: Could not find a valid container or subtitle button for placement. Appending directly to captionSection as last resort.', captionSection);
        captionSection.appendChild(button);
      }
      // createToast('Generate Captions button is now available', 'info', 5000); // Removed as per user request
      console.log('[addGenerateCaptionsButton] Added generate captions button successfully');
    };
    
    // Function to generate captions for a video
    const generateCaptions = async () => {
      try {
        // Find media element in the dialog
        const container = document.querySelector('[data-testid="composePostView"]') || document.body;
        const videoElement = findMediaElement(container);
        
        if (!videoElement || !(videoElement instanceof HTMLVideoElement)) {
          createToast('No video found to generate captions for', 'error');
          return;
        }
        
        console.log('[generateCaptions] Found video element:', videoElement);
        
        // Show loading state
        const button = document.getElementById(CAPTION_BUTTON_ID);
        if (!button) return;
        
        const originalButtonText = button.textContent;
        button.textContent = 'Processing...';
        button.setAttribute('disabled', 'true');
        button.style.opacity = '0.7';
        
        createToast('Analyzing video to generate captions...', 'info');
        
        // Get the video source
        const mediaUrl = await getMediaSource(videoElement);
        if (!mediaUrl) {
          createToast('Could not access video content', 'error');
          resetButton();
          return;
        }
        
        console.log(`[generateCaptions] Got media source URL: ${mediaUrl.substring(0, 50)}...`);
        
        // Connect to background script
        const port = browser.runtime.connect({ name: "captionGenerator" });
        console.log('[generateCaptions] Connected to background script');
        
        // Set timeout to handle hanging requests
        const timeoutId = setTimeout(() => {
          port.disconnect();
          createToast('Request timed out. The video might be too large or complex to process.', 'error');
          resetButton();
        }, 300000); // 5-minute timeout
        
        // Send the request
        console.log('[generateCaptions] Sending request to background script');
        port.postMessage({
          action: 'generateCaptions',
          mediaUrl: mediaUrl,
          duration: videoElement.duration || 0
        });
        
        // Listen for response
        port.onMessage.addListener((response) => {
          clearTimeout(timeoutId);
          console.log('[generateCaptions] Received response from background script:', response);
          
          if (response.error) {
            console.error('[generateCaptions] Error from background script:', response.error);
            
            const errorMsg = response.error;
            // Check for size-related error messages and standardize them
            if (typeof errorMsg === 'string' && (
                errorMsg.toLowerCase().includes('too large') || 
                errorMsg.toLowerCase().includes('413') || 
                errorMsg.toLowerCase().includes('request entity too large') ||
                errorMsg.toLowerCase().includes('payload too large') ||
                errorMsg.toLowerCase().includes('message length exceeded') ||
                errorMsg.toLowerCase().includes('size limit'))) {
              createToast('Server error: File exceeds size limits (max 20MB). Please use a smaller file.', 'error');
            } else {
              createToast(`Error: ${errorMsg}`, 'error');
            }
            
            resetButton();
            return;
          }
          
          if (response.vttContent) {
            // Download the VTT file
            downloadVTTFile(response.vttContent);
            createToast('Captions generated and downloaded!', 'success');
            
            // Find the file input in the captions section
            const fileInput = document.querySelector('input[type="file"][accept=".vtt"]');
            if (fileInput) {
              createToast('Please select the downloaded .vtt file', 'info', 6000);
            }
          }
          
          resetButton();
        });
        
        port.onDisconnect.addListener(() => {
          clearTimeout(timeoutId);
          const lastError = browser.runtime.lastError;
          if (lastError) {
            console.error('[generateCaptions] Port disconnected with error:', lastError);
            createToast('Connection error while generating captions', 'error');
            resetButton();
          }
        });
        
        // Function to reset the button state
        function resetButton() {
          if (!button) return;
          button.textContent = originalButtonText;
          button.removeAttribute('disabled');
          button.style.opacity = '1';
        }
      } catch (error: unknown) { // Specify unknown type for error
        console.error('[generateCaptions] Error:', error);
        createToast(`Error generating captions: ${(error instanceof Error ? error.message : String(error))}`, 'error'); // Safe access to message
        
        // Reset button state
        const button = document.getElementById(CAPTION_BUTTON_ID);
        if (button) {
          button.textContent = 'Generate Captions';
          button.removeAttribute('disabled');
          button.style.opacity = '1';
        }
      }
    };
    
    // Helper function to download the VTT file
    const downloadVTTFile = (vttContent: string) => {
      const filename = `captions-${Date.now()}.vtt`;
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    };
    
    // Modified MutationObserver to look for caption sections too
    const observeAltTextAreas = () => {
      if (manualModeObserver) manualModeObserver.disconnect(); 
      console.log('[observeAltTextAreas] Starting observer for manual button injection.');
      
      document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);
      
      // Also check for caption sections on initial load
      // Try multiple times to handle dynamic UI loading
      addGenerateCaptionsButton();
      setTimeout(addGenerateCaptionsButton, 500);  // First attempt shortly after load
      setTimeout(addGenerateCaptionsButton, 2000); // Second attempt after 2 seconds
      setTimeout(addGenerateCaptionsButton, 5000); // Third attempt after 5 seconds

      manualModeObserver = new MutationObserver((mutations) => {
        // Keep track if we've detected a likely dialog change that might contain captions
        let shouldCheckForCaptions = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node instanceof HTMLElement) {
                // Handle alt text areas
                if (node.matches(ALT_TEXT_SELECTOR)) {
                   addGenerateButton(node as HTMLTextAreaElement);
                }
                node.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR)
                  .forEach(addGenerateButton);
                  
                // Detect dialog additions and video-related elements
                if (node.matches('div[role="dialog"]') || 
                    node.getAttribute('aria-label')?.includes('Video') || 
                    node.getAttribute('aria-label')?.includes('video') || 
                    node.querySelector('video')) {
                  console.log('[MutationObserver] Detected new dialog or video element:', node);
                  shouldCheckForCaptions = true;
                }
                
                // Look for captions sections by content
                if (node.textContent?.includes('Captions') || 
                    node.textContent?.includes('.vtt') || 
                    node.textContent?.includes('subtitle') || 
                    node.innerHTML?.includes('caption') ||
                    node.querySelector('input[type="file"][accept*=".vtt"]')) {
                  console.log('[MutationObserver] Detected possible caption-related element:', node);
                  shouldCheckForCaptions = true;
                }
                
                // Check for video elements being added
                if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                  console.log('[MutationObserver] Video element detected:', node);
                  shouldCheckForCaptions = true;
                }
              }
            });
          }
          // Check for attribute changes on dialogs or video containers
          if (mutation.type === 'attributes' && 
              mutation.target instanceof HTMLElement && 
              (mutation.target.matches('div[role="dialog"]') ||
               mutation.target.querySelector('video'))) {
            console.log('[MutationObserver] Detected attribute change on dialog or video container:', mutation.target);
            shouldCheckForCaptions = true;
          }
          
          // Alt text area handling (keep existing code)
          if (mutation.type === 'attributes' && 
              mutation.target instanceof HTMLElement && 
              mutation.target.matches(ALT_TEXT_SELECTOR)) {
             addGenerateButton(mutation.target as HTMLTextAreaElement);
          }
        }
        
        // If we detected any changes that might involve captions, try to add the button
        if (shouldCheckForCaptions) {
          console.log('[MutationObserver] Detected potential caption-related changes, attempting to add button');
          // Use a timeout to let the UI stabilize
          setTimeout(addGenerateCaptionsButton, 300);
          // Try again a bit later in case the first attempt was too early
          setTimeout(addGenerateCaptionsButton, 1000);
        }
      });

      manualModeObserver.observe(document.body, { 
          childList: true, 
          subtree: true, 
          attributes: true, 
          attributeFilter: ['aria-label', 'placeholder', 'data-testid', 'role', 'style', 'class'] 
      });
      console.log('[observeAltTextAreas] Observer attached to document body.');
    };
    
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