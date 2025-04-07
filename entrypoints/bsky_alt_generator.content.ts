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

      for (const selector of selectors) {
          const element = container.querySelector<HTMLImageElement | HTMLVideoElement | HTMLSourceElement>(selector);
          
          if (element instanceof HTMLSourceElement) {
              const videoParent = element.closest('video');
              if (videoParent && isElementVisible(videoParent)) {
                  console.log(`[findMediaElement - Simplified] Found video via source selector: ${selector}`, videoParent);
                  return videoParent;
              } else {
                  // console.warn(`[findMediaElement - Simplified] Found source tag but parent video hidden/invalid: ${selector}`, element);
              }
              continue; 
          }
          
          if (element && isElementVisible(element)) {
              console.log(`[findMediaElement - Simplified] Found media via direct selector: ${selector}`, element);
              return element; 
          } else if (element) {
              // console.warn(`[findMediaElement - Simplified] Media found but hidden/too small with selector: ${selector}`, element);
          }
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
    
    // Function to get media element as Data URL
    const getMediaAsDataUrl = async (mediaElement: HTMLImageElement | HTMLVideoElement): Promise<string | null> => {
      try {
        if (mediaElement instanceof HTMLImageElement) {
          // Handle Image
          if (mediaElement.src.startsWith('data:')) {
            return mediaElement.src;
          } else if (mediaElement.src.startsWith('blob:')) {
            const response = await fetch(mediaElement.src);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } else {
            // Attempt to draw to canvas for external images (might be blocked by CORS)
            console.log('[getMediaAsDataUrl] Attempting canvas fallback for image src:', mediaElement.src);
            const canvas = document.createElement('canvas');
            canvas.width = mediaElement.naturalWidth || mediaElement.width;
            canvas.height = mediaElement.naturalHeight || mediaElement.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get 2D context');
            ctx.drawImage(mediaElement, 0, 0);
            return canvas.toDataURL(); // Defaults to png, or specify type e.g., 'image/jpeg'
          }
        } else if (mediaElement instanceof HTMLVideoElement) {
          // Handle Video - Capture current frame
          console.log('[getMediaAsDataUrl] Capturing frame from video:', mediaElement);
          const canvas = document.createElement('canvas');
          canvas.width = mediaElement.videoWidth;
          canvas.height = mediaElement.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not get 2D context');
          ctx.drawImage(mediaElement, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg'); // Capture as JPEG
        }
      } catch (error) {
        console.error('[getMediaAsDataUrl] Error converting media to Data URL:', error, mediaElement);
        createToast('Error processing media. It might be protected or inaccessible.', 'error');
      }
      return null;
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
          console.log('[addGenerateButton] Context is composePostView or Add alt text, targeting context container for media search:', mediaSearchContainer);
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
      const iconUrl = browser.runtime.getURL("/icon/gen-alt-text.svg"); 
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
        const dataUrl = await getMediaAsDataUrl(mediaElement);

        if (!dataUrl) {
             console.error('[generateAltText] Failed to get media as Data URL.');
             button.textContent = 'Error: Process Fail';
             button.style.color = '#000000';
             setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; 
                button.disabled = false; 
             }, 3000);
             return;
        }
        
        const isVideo = mediaElement.tagName === 'VIDEO';
        console.log(`[generateAltText] Got ${isVideo ? 'Video' : 'Image'} as Data URL (length: ${dataUrl.length})`);

        try {
            console.log('[generateAltText] Connecting to background...');
            button.textContent = 'Connecting...';
            button.style.color = '#000000'; 
            const port = browser.runtime.connect({ name: "altTextGenerator" });
            console.log('[generateAltText] Connection established.');
            button.textContent = 'Generating...';
            button.style.color = '#000000';

            port.onMessage.addListener((response: any) => {
              console.log('[generateAltText] Msg from background:', response);
              let statusText = '';
              let isError = false;
              
              if (response.altText) {
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
                isError = true;
                // Show error toast
                createToast(`Error: ${errorMsg}`, 'error'); 
              } else {
                statusText = 'Msg Format Err';
                isError = true;
                console.error('[generateAltText] Unexpected message format:', response);
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
              console.error('[generateAltText] Port disconnected.', lastError || '(No error info)');
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

            console.log('[generateAltText] Sending message...');
            port.postMessage({ action: 'generateAltText', imageUrl: dataUrl, isVideo: isVideo });
            console.log('[generateAltText] Message sent.');

          } catch (error: unknown) {
            console.error('[generateAltText] Connect/Post error:', error);
            button.textContent = 'Connect Error';
            button.style.color = '#000000'; 
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; 
                button.disabled = false; 
            }, 2000);
          }
      };
      
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        generateAltText();
      });

      // --- START: Modify Button Insertion Again ---
      // Insert the container within the parent, but specifically after the textarea
      buttonAttachPoint.insertBefore(buttonContainer, textarea.nextSibling);
      // --- END: Modify Button Insertion Again ---
      textarea.dataset.geminiButtonAdded = 'true';
      console.log('[addGenerateButton] Button added successfully after textarea within parent:', buttonAttachPoint);
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