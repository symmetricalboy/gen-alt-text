export default defineContentScript({
  matches: ['*://*.bsky.app/*'],
  main() {
    console.log('Bluesky Alt Text Generator loaded');
    
    // Only run in browser (not during build/ssr)
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
    // Constants - Use multiple attribute-based selectors for robustness
    const ALT_TEXT_SELECTORS = [
      'textarea[aria-label="Alt text"]',
      'textarea[placeholder*="alt"]',
      'textarea[placeholder*="Alt"]',
      'textarea[data-testid*="alt"]',
      '[role="textbox"][aria-label*="alt" i]'
    ];
    const ALT_TEXT_SELECTOR = ALT_TEXT_SELECTORS.join(',');
    const BUTTON_ID = 'gemini-alt-text-button';
    
    // --- START: New selectors and file handling logic ---
    // Selectors - these might need adjustment based on bsky.app's actual structure
    const COMPOSER_SELECTOR = '[data-testid="composer"]'; // Assuming a general composer container
    const FILE_INPUT_SELECTOR = `input[type="file"][aria-label*="media" i]`; // More specific input selector, relative to composer later
    const DROP_ZONE_SELECTOR = COMPOSER_SELECTOR; // Assuming the whole composer is the drop zone

    // --- END: New selectors and file handling logic ---
    
    // Configuration (will be controlled by popup)
    // Define config type for better safety
    interface Config {
      autoMode: boolean;
      showToasts: boolean;
    }
    let config: Config = {
      autoMode: false,
      showToasts: true
    };
        
    // --- START: Load config using wxt/storage ---
    async function loadConfig() {
      try {
        // Use browser.storage.local
        const result = await browser.storage.local.get(['autoMode', 'showToasts']) as Partial<Config>; 
        if (result) {
          config = { ...config, ...result };
        }
        console.log('Loaded config:', config);
      } catch (error: unknown) {
        console.error('Error loading config from storage:', error);
      }
    }
    loadConfig();
    
    // --- START: Listen for config changes using wxt/storage ---
    // Use browser.storage.onChanged
    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            let changed = false;
            if (changes.autoMode) { config.autoMode = changes.autoMode.newValue; changed = true; }
            if (changes.showToasts) { config.showToasts = changes.showToasts.newValue; changed = true; }
            if (changed) console.log('Updated config via storage listener:', config);
        }
    });
    // --- END: Listen for config changes ---
    
    // --- START: Function to handle and send files ---
    const handleFiles = (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      console.log(`Intercepted ${files.length} file(s)`);

      for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
           console.log(`Skipping non-media file: ${file.name} (${file.type})`);
           continue;
        }

        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          const base64Data = e.target?.result;
          if (typeof base64Data === 'string') {
             console.log(`Read file ${file.name} (${file.type}), sending to background...`);
             // Use browser.runtime.sendMessage
             browser.runtime.sendMessage({
               type: 'MEDIA_INTERCEPTED',
               payload: {
                 filename: file.name,
                 filetype: file.type,
                 dataUrl: base64Data,
                 size: file.size
               }
             }).then((response: any) => {
               console.log('Background script responded to MEDIA_INTERCEPTED:', response);
             }).catch((error: unknown) => {
               console.error('Error sending MEDIA_INTERCEPTED message or receiving response:', error);
             });

             if (config.showToasts) {
                createToast(`Captured ${file.name}`, 'info', 2000);
             }
          } else {
             console.error(`Failed to read file ${file.name} as Base64 Data URL.`);
          }
        };
        reader.onerror = (e: ProgressEvent<FileReader>) => {
          console.error(`Error reading file ${file.name}:`, e);
        };
        reader.readAsDataURL(file);
      }
    };
    // --- END: Function to handle and send files ---
    
    // Toast notification system
    const createToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration: number = 5000) => {
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
    
    // Function to check if an element is an image or video uploader (No changes needed, types already good)
    const isMediaUploader = (element: Element): boolean => {
      if (element instanceof HTMLInputElement && 
          element.type === 'file' && 
          (element.accept?.includes('image') || element.accept?.includes('video'))) {
        return true;
      }
      if (element.getAttribute('data-testid')?.includes('upload') || 
          element.getAttribute('aria-label')?.includes('upload') ||
          element.getAttribute('role') === 'button' && 
          (element.textContent?.includes('image') || element.textContent?.includes('photo') || 
           element.textContent?.includes('video') || element.textContent?.includes('media'))) {
        return true;
      }
      return false;
    };
    
    // Function to find media elements in the composer (Add types)
    // Simplified based on reliable container finding
    const findMediaElement = (container: Element): HTMLImageElement | HTMLVideoElement | null => {
      console.log('[findMediaElement - Simplified] Searching for media in container:', container);

      const isElementVisible = (el: Element | null): el is HTMLElement => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          // Relaxed visibility check slightly, primary check is the selector
          return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null;
      };
      
      // --- START: Use simplified, direct selectors within the known container --- 
      // Focus on common preview patterns and basic img/video tags
      const selectors: string[] = [
        // Common test IDs for image/video previews
        '[data-testid="imagePreview"] img[src]', 
        '[data-testid="images"] img[src]',
        '[data-testid="videoPreview"] video[src]', 
        '[data-testid="videos"] video[src]',
        '[data-testid="videoPreview"] video source[src]', // Include source tag for video
        '[data-testid="videos"] video source[src]',
        // General img/video tags within the container (as a fallback)
        'img[src]:not([alt*="avatar" i]):not([src*="avatar"])', // Basic image, avoid avatars
        'video[src]', // Basic video
        'video source[src]' // Basic video source
        /* Removed specific src checks (data:, blob:) - check all src now
        '[data-testid="imagePreview"] img[src^="data:image/"]', '[data-testid="images"] img[src^="data:image/"]', // Specific Data URL
        '[data-testid="imagePreview"] img[src^="blob:"]', '[data-testid="images"] img[src^="blob:"]', // Specific Blob URL
        'img[src^="data:image/"]', // Any Data URL
        'img[src^="blob:"]' // Any Blob URL
        */
      ];

      for (const selector of selectors) {
          const element = container.querySelector<HTMLImageElement | HTMLVideoElement | HTMLSourceElement>(selector);
          
          // Handle finding the <source> tag within a <video>
          if (element instanceof HTMLSourceElement) {
              const videoParent = element.closest('video');
              if (videoParent && isElementVisible(videoParent)) {
                  console.log(`[findMediaElement - Simplified] Found video via source selector: ${selector}`, videoParent);
                  return videoParent;
              } else {
                  console.warn(`[findMediaElement - Simplified] Found source tag but parent video hidden/invalid: ${selector}`, element);
              }
              continue; // Move to next selector if source's video isn't valid
          }
          
          // Handle finding <img> or <video> directly
          if (element && isElementVisible(element)) {
              console.log(`[findMediaElement - Simplified] Found media via direct selector: ${selector}`, element);
              return element; // Return the first visible match
          } else if (element) {
              console.warn(`[findMediaElement - Simplified] Media found but hidden/too small with selector: ${selector}`, element);
          }
      }
      // --- END: Use simplified, direct selectors --- 

      // --- START: Remove scoring logic --- 
      console.error('[findMediaElement - Simplified] FAILED: No suitable media found using direct selectors.');
      /*
      console.log('No valid data/blob URL image found via direct selectors, proceeding to scoring logic...');

      const candidates = Array.from(container.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video'));
      let bestCandidate: HTMLImageElement | HTMLVideoElement | null = null;
      let highestScore = -1;

      for (const el of candidates) {
        let currentScore = 0;
        const elRect = el.getBoundingClientRect();
        
        if (!isElementVisible(el)) continue;

        if (el instanceof HTMLVideoElement) {
          if (el.src || el.querySelector('source[src]')) {
            currentScore = 1000;
          } else {
            continue;
          }
        } else if (el instanceof HTMLImageElement) {
          const img = el;
          const src = img.src || '';
          const alt = img.alt || '';

          if (!src || src.startsWith('data:') || src.startsWith('blob:') || alt.toLowerCase().includes('avatar') || src.includes('avatar') || src.includes('profile')) {
            continue;
          }
          
          const minSize = 50;
          if (elRect.width < minSize || elRect.height < minSize) {
            continue;
          }
          
          currentScore = 1;
          console.log(`Valid scoring candidate: ${elRect.width}x${elRect.height}`, img);

          // Corrected closest call with type parameter outside selector
          const previewWrapper = img.closest<Element>('[data-testid="imagePreview"], .r-1p0dtai[style*="aspect-ratio"]');
          if (previewWrapper) {
            currentScore += 500;
          }
          
          if (currentScore <= 1 && img.matches('[data-testid*="image"], [data-testid*="preview"], [role="img"]')) {
             currentScore += 50;
          }
          
          const imgPostContainer = img.closest<Element>('[data-testid="postView"], [role="article"]');
          const mainPostContainer = (container instanceof Element) ? container.closest<Element>('[data-testid="postView"], [role="article"]') : null;
          if (imgPostContainer && mainPostContainer && imgPostContainer !== mainPostContainer) {
               currentScore = Math.max(0, currentScore - 100);
          }
          
          currentScore += Math.min(5, Math.floor(elRect.width / 100)); 
        }
        
        if (currentScore > highestScore) {
            highestScore = currentScore;
            bestCandidate = el;
            console.log('New best candidate (scoring) with score:', highestScore, bestCandidate);
        }
      }
      
      if (bestCandidate) {
        console.log('Final selected best candidate (from scoring):', bestCandidate);
      } else {
         console.error('SCORING FAILED: No suitable media candidate found via scoring logic.');
      }
      return bestCandidate;
      */
      // --- END: Remove scoring logic --- 
      return null; // Return null if no media found via direct selectors
    };
    
    // --- START: New Helper to get Data URL ---
    // Fetches blob/http URLs and converts to a base64 Data URL within the content script context
    async function getMediaAsDataUrl(element: HTMLImageElement | HTMLVideoElement): Promise<string | null> {
      if (!element || !element.src) {
        console.warn('[getMediaAsDataUrl] Invalid element or src');
        return null;
      }
      const sourceUrl = element.src;

      if (sourceUrl.startsWith('data:')) {
        console.log('[getMediaAsDataUrl] Source is already Data URL');
        return sourceUrl; // Already a data URL
      }

      if (sourceUrl.startsWith('blob:') || sourceUrl.startsWith('http')) {
        console.log('[getMediaAsDataUrl] Fetching source URL:', sourceUrl);
        try {
          const fetchResponse = await fetch(sourceUrl);
          if (!fetchResponse.ok) {
            throw new Error(`Failed to fetch media URL: ${fetchResponse.statusText} (${fetchResponse.status})`);
          }
          const blob = await fetchResponse.blob();
          console.log('[getMediaAsDataUrl] Fetched blob, type:', blob.type);

          // Convert blob to base64 Data URL
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                console.log('[getMediaAsDataUrl] Blob converted to base64 Data URL');
                resolve(reader.result);
              } else {
                reject(new Error('Blob reader result was not a string.'));
              }
            };
            reader.onerror = (error) => {
               console.error('[getMediaAsDataUrl] FileReader error:', error);
               reject(new Error('FileReader error reading blob.'));
            };
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('[getMediaAsDataUrl] Error fetching or converting URL:', error);
          return null; // Return null on fetch/conversion error
        }
      } else {
         console.warn('[getMediaAsDataUrl] Unhandled URL scheme:', sourceUrl);
         return null; // Unhandled scheme
      }
    }
    // --- END: New Helper to get Data URL ---

    // Add the button to an alt text textarea (Add types)
    function addGenerateButton(textarea: HTMLTextAreaElement) {
      if (textarea.dataset.geminiButtonAdded === 'true') return;
      console.log('[addGenerateButton] Starting for textarea:', textarea);

      // --- START: Find the MAIN composer container FIRST and robustly ---
      const composerContainer = findComposerContainer(textarea);
      if (!composerContainer) {
          console.error('[addGenerateButton] Could not find the main composer container using findComposerContainer. Button will not be added or may not function correctly.');
          // Decide if we should return here or allow adding the button but expect failure
          // For now, let's prevent adding the button if the main container isn't found.
          return; 
      }
      console.log('[addGenerateButton] Found composer container:', composerContainer);
      // --- END: Find the MAIN composer container FIRST ---

      // Check if a button ALREADY exists within this specific composer container
      if (composerContainer.querySelector(`#${BUTTON_ID}`)) {
         console.log('[addGenerateButton] Button already exists in this composer container, marking textarea and skipping UI creation.');
         textarea.dataset.geminiButtonAdded = 'true'; // Still mark the textarea
         return;
      }
      
      // Find a good place to physically *attach* the button UI (e.g., near the textarea)
      const buttonAttachPoint = textarea.parentElement; // Or adjust as needed for layout
      if (!buttonAttachPoint) {
          console.error('[addGenerateButton] Could not find a suitable attach point (parentElement) for the button UI near the textarea.');
          return; // Cannot attach the button
      }

      const buttonContainer = document.createElement('div');
      Object.assign(buttonContainer.style, {
          display: 'flex', alignItems: 'center', gap: '8px', 
          // Ensure the button UI doesn't interfere with layout too much
          marginTop: '4px', // Add some space above
          justifyContent: 'flex-end' // Align button to the right perhaps?
      });

      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text';
      button.innerHTML = `<svg width="20" height="20" viewBox="-5 -10 128 128" xmlns="http://www.w3.org/2000/svg"><path d="M 35.746,4 C 20.973,4 9,15.973 9,30.746 V 77.254 C 9,92.027 20.973,104 35.746,104 H 82.254 C 97.027,104 109,92.027 109,77.254 V 30.746 C 109,15.973 97.027,4 82.254,4 Z m -19.77,26.746 c 0,-10.918 8.8516,-19.77 19.77,-19.77 h 46.508 c 10.918,0 19.77,8.8516 19.77,19.77 v 46.508 c 0,10.918 -8.8516,19.77 -19.77,19.77 H 35.746 c -10.918,0 -19.77,-8.8516 -19.77,-19.77 z m 45.609,0.37891 c -1.082,-2.1055 -4.0898,-2.1055 -5.1719,0 l -4.3242,8.4219 c -1.668,3.2383 -4.3047,5.875 -7.543,7.543 l -8.4219,4.3242 c -2.1055,1.082 -2.1055,4.0898 0,5.1719 l 8.4219,4.3242 c 3.2383,1.668 5.875,4.3047 7.543,7.543 l 4.3242,8.4219 c 1.082,2.1055 4.0898,2.1055 5.1719,0 l 4.3242,-8.4219 c 1.668,-3.2383 4.3047,-5.875 7.543,-7.543 l 8.4219,-4.3242 c 2.1055,-1.082 2.1055,-4.0898 0,-5.1719 l -8.4219,-4.3242 c -3.2383,-1.668 -5.875,-4.3047 -7.543,-7.543 z" fill="#323248" stroke="none" /></svg>`;
      Object.assign(button.style, {
          marginLeft: '8px', padding: '4px', cursor: 'pointer', border: '1px solid #ccc',
          borderRadius: '4px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center',
          justifyContent: 'center'
      });
      button.style.setProperty('visibility', 'visible', 'important');
      button.style.setProperty('z-index', '9999', 'important');
      button.style.setProperty('position', 'relative', 'important');

      const originalButtonContent = button.innerHTML;

      const autoToggle = document.createElement('label');
      autoToggle.className = 'gemini-auto-toggle';
      autoToggle.title = 'Auto-generate alt text when media is added';
      Object.assign(autoToggle.style, {
         display: 'flex', alignItems: 'center', fontSize: '12px', cursor: 'pointer'
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.margin = '0 4px 0 0';
      checkbox.checked = config.autoMode;
      checkbox.addEventListener('change', async (e: Event) => {
        if (e.target instanceof HTMLInputElement) {
           config.autoMode = e.target.checked;
           try {
              // Use browser.storage.local.set
              await browser.storage.local.set({ ...config, autoMode: config.autoMode });
              console.log('Saved autoMode setting:', config.autoMode);
           } catch (error: unknown) {
              console.error('Error saving autoMode setting:', error);
           }
        }
      });

      autoToggle.appendChild(checkbox);
      autoToggle.appendChild(document.createTextNode('Auto'));
      buttonContainer.appendChild(button);
      buttonContainer.appendChild(autoToggle);

      const generateAltText = async () => {
        button.innerHTML = '';
        button.textContent = 'Finding Media...';
        button.disabled = true;

        // --- IMPORTANT: Use the composerContainer identified earlier for the search --- 
        console.log('[generateAltText] Searching for media within confirmed composer container:', composerContainer);
        const mediaElement = findMediaElement(composerContainer);
        // --- End search context change ---
        
        console.log('[generateAltText] Media element found in composer:', mediaElement);

        if (!mediaElement || !(mediaElement instanceof HTMLImageElement || mediaElement instanceof HTMLVideoElement)) {
            console.error('[generateAltText] Could not find valid media element.');
            button.textContent = 'Error: No Media';
            setTimeout(() => { button.innerHTML = originalButtonContent; button.disabled = false; }, 2000);
            return;
        }

        // --- START: Use helper to get Data URL ---
        button.textContent = 'Processing Media...';
        const dataUrl = await getMediaAsDataUrl(mediaElement);

        if (!dataUrl) {
             console.error('[generateAltText] Failed to get media as Data URL.');
             button.textContent = 'Error: Process Fail';
             setTimeout(() => { button.innerHTML = originalButtonContent; button.disabled = false; }, 3000);
             return;
        }
        // --- END: Use helper to get Data URL ---

        // const mediaUrl = mediaElement.src; // No longer needed directly
        const isVideo = mediaElement.tagName === 'VIDEO';
        console.log(`[generateAltText] Got ${isVideo ? 'Video' : 'Image'} as Data URL (length: ${dataUrl.length})`);

        try {
            console.log('[generateAltText] Connecting to background...');
            button.textContent = 'Connecting...'; // Reset status before connect
            // Use browser.runtime.connect
            const port = browser.runtime.connect({ name: "altTextGenerator" });
            console.log('[generateAltText] Connection established.');
            button.textContent = 'Generating...';

            port.onMessage.addListener((response: any) => {
              console.log('[generateAltText] Msg from background:', response);
              let statusText = '';
              let isError = false;
              
              if (response.altText) {
                textarea.value = response.altText;
                textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                statusText = '✓ Done';
                if (config.showToasts) createToast('Alt text generated! Please review.', 'success');
              } else if (response.error) {
                const errorMsg = typeof response.error === 'string' ? response.error : 'Unknown error';
                statusText = `Error: ${errorMsg.substring(0, 20)}...`;
                isError = true;
                if (config.showToasts) createToast(`Error: ${errorMsg}`, 'error');
              } else {
                statusText = 'Msg Format Err';
                isError = true;
                console.error('[generateAltText] Unexpected message format:', response);
              }
              
              button.textContent = statusText;
              setTimeout(() => {
                  button.innerHTML = originalButtonContent;
                  button.disabled = false;
              }, isError ? 3000 : 1500);
              
              try { port.disconnect(); } catch (e) { /* Ignore */ }
            });

            port.onDisconnect.addListener(() => {
              // Use browser.runtime.lastError
              const lastError = browser.runtime.lastError;
              console.error('[generateAltText] Port disconnected.', lastError || '(No error info)');
              const currentText = button.textContent;
              if (currentText && !currentText.includes('Done') && !currentText.includes('Error')) {
                button.textContent = 'Disconnect Err';
                setTimeout(() => { button.innerHTML = originalButtonContent; button.disabled = false; }, 3000);
              }
            });

            console.log('[generateAltText] Sending message...');
            // Send the dataUrl obtained from the helper
            port.postMessage({ action: 'generateAltText', imageUrl: dataUrl, isVideo: isVideo });
            console.log('[generateAltText] Message sent.');

          } catch (error: unknown) {
            console.error('[generateAltText] Connect/Post error:', error);
            button.textContent = 'Connect Error';
            setTimeout(() => { button.innerHTML = originalButtonContent; button.disabled = false; }, 2000);
          }
      };

      button.onclick = async (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        console.log('[addGenerateButton] Button clicked');
        await generateAltText();
      };

      // Append the button UI near the textarea
      // Consider appending to buttonAttachPoint or maybe composerContainer depending on desired location
      buttonAttachPoint.insertAdjacentElement('afterend', buttonContainer); // Place it after the textarea's parent
      // Alternatively: composerContainer.appendChild(buttonContainer); // Append to bottom of composer

      textarea.dataset.geminiButtonAdded = 'true';
      console.log('[addGenerateButton] Button UI setup complete and attached.');
    }
    
    // Helper function to find the composer container
    function findComposerContainer(element: Element): Element | null {
      console.log('[findComposerContainer] Searching from:', element);
      // --- START: Use specific, reliable selectors provided by user ---
      const specificSelectors = [
          '[data-testid="composePostView"]', // Container when composing a post
          '[aria-label="Add alt text"]'      // Container when adding alt text (likely a dialog/modal)
      ];
      // --- END: Use specific, reliable selectors ---
      
      // Remove validationSelectors and fallback logic as these are deemed reliable
      /*
      const validationSelectors = [
          '[data-testid="imagePreview"]', '[data-testid="images"]',
          'button[aria-label*="Post"]', 'button[type="submit"]'
      ];
      */
      
      for (const selector of specificSelectors) {
          const container = element.closest<Element>(selector);
          // Simplify the check: If closest finds a container matching the selector, and it contains the starting element, use it.
          if (container && container.contains(element)) {
              console.log('[findComposerContainer] Found valid container via specific selector:', selector, container);
              return container;
          }
      }
      
      // --- START: Remove fallback logic --- 
      console.error('[findComposerContainer] Failed to find any container using specific selectors:', specificSelectors.join(', '));
      /*
      console.log('[findComposerContainer] No primary container found, trying fallback parent check.');
      // Fallback: simple parent check (less reliable)
      const fallback = element.parentElement?.parentElement || element.parentElement;
      if (fallback) {
           console.warn('[findComposerContainer] Using fallback container:', fallback);
           return fallback;
      }
      console.error('[findComposerContainer] Failed to find any container.');
      */
      // --- END: Remove fallback logic ---
      return null;
    }
    
    // Watch for media uploads to trigger auto-generation
    const observeMediaElements = () => {
      const mediaObserver = new MutationObserver(mutations => {
        if (!config.autoMode) return; // Only process if auto mode is on
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node instanceof HTMLElement) { // Check if node is HTMLElement
                const checkElement = (element: HTMLElement) => {
                   if ((element.tagName === 'IMG' || element.tagName === 'VIDEO') && !element.getAttribute('alt')?.includes('avatar')) {
                      console.log('Auto-gen: Media element detected:', element);
                      const container = findComposerContainer(element);
                      if (container) {
                          setTimeout(() => {
                              const textarea = container.querySelector<HTMLTextAreaElement>(ALT_TEXT_SELECTOR);
                              if (textarea) {
                                  addGenerateButton(textarea); // Ensure button exists
                                  const button = container.querySelector<HTMLButtonElement>(`#${BUTTON_ID}`);
                                  if (button && !button.disabled) {
                                      console.log('Auto-generating alt text for:', element);
                                      button.click();
                                  }
                              } else {
                                  console.log('Auto-gen: No alt text field found yet for media:', element);
                                  // Optional: could add a temporary observer here if needed
                              }
                          }, 500); // Delay to allow alt text field to render
                      }
                   }
                };
                
                // Check the added node itself
                checkElement(node);
                // Check children if the added node is a container
                node.querySelectorAll<HTMLElement>('img, video').forEach(checkElement);
              }
            });
          }
        }
      });
      mediaObserver.observe(document.body, { childList: true, subtree: true });
      console.log('Media observer started for auto-generation.');
    };
    
    // Process existing textareas on load
    document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);
    
    // Watch for dynamically added textareas
    const mainObserver = new MutationObserver(mutations => {
      console.log('Main observer triggered.');
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node instanceof Element) { // Check node type
              if (node.matches(ALT_TEXT_SELECTOR)) {
                addGenerateButton(node as HTMLTextAreaElement);
              } 
              node.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);
            }
          });
        }
      }
    });
    
    mainObserver.observe(document.body, { childList: true, subtree: true });
    observeMediaElements();

    // Attach listeners for drag/drop and file input events
    const attachMediaListeners = (composerElement: Element) => {
        console.log('[attachMediaListeners] Attaching to:', composerElement);
        
        const fileInput = composerElement.querySelector<HTMLInputElement>(FILE_INPUT_SELECTOR);
        const dropZone = composerElement.closest<HTMLElement>(DROP_ZONE_SELECTOR) || (composerElement instanceof HTMLElement ? composerElement : null);

        const fileInputEl = fileInput as HTMLElement | null;
        if (fileInputEl && !fileInputEl.dataset.mediaListenerAttached) {
            fileInputEl.addEventListener('change', (event: Event) => {
                if (event.target instanceof HTMLInputElement) {
                    console.log('[attachMediaListeners] File input CHANGED');
                    handleFiles(event.target.files);
                }
            });
            fileInputEl.dataset.mediaListenerAttached = 'true';
            console.log('[attachMediaListeners] Change listener attached to file input.');
        } else if (fileInputEl) {
             console.log('[attachMediaListeners] Change listener already attached to file input.');
        } else {
             console.warn('[attachMediaListeners] Could not find file input using selector:', FILE_INPUT_SELECTOR, 'within:', composerElement);
        }

        const dropZoneEl = dropZone as HTMLElement | null;
        if (dropZoneEl && !dropZoneEl.dataset.dropListenerAttached) {
            dropZoneEl.addEventListener('dragover', (event: DragEvent) => {
                event.preventDefault(); event.stopPropagation();
            });
            dropZoneEl.addEventListener('drop', (event: DragEvent) => {
                event.preventDefault(); event.stopPropagation();
                console.log('[attachMediaListeners] DROP event detected');
                if (event.dataTransfer?.files) {
                    handleFiles(event.dataTransfer.files);
                }
            });
            dropZoneEl.dataset.dropListenerAttached = 'true';
            console.log('[attachMediaListeners] Drop/Dragover listeners attached to drop zone:', dropZoneEl);
        } else if (dropZoneEl) {
             console.log('[attachMediaListeners] Drop/Dragover listeners already attached.');
        } else {
             console.warn('[attachMediaListeners] Could not find drop zone using selector:', DROP_ZONE_SELECTOR);
        }
    };

    // Observe for composer elements appearing to attach listeners
    const observeForComposer = () => {
        console.log('Setting up observer for composer elements...');
        const composerObserver = new MutationObserver((mutationsList) => { 
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node instanceof Element) {
                            if (node.matches(COMPOSER_SELECTOR)) {
                                console.log('Composer added directly:', node);
                                attachMediaListeners(node);
                            }
                            node.querySelectorAll<Element>(COMPOSER_SELECTOR).forEach(composer => {
                                console.log('Composer found via querySelectorAll:', composer);
                                attachMediaListeners(composer);
                            });
                        }
                    });
                }
            }
        });
        composerObserver.observe(document.body, { childList: true, subtree: true });
        console.log('Composer observer started.');
        
        // Check existing on load
        document.querySelectorAll<Element>(COMPOSER_SELECTOR).forEach(attachMediaListeners);
    };

    // --- START: Call the observer setup ---
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
       observeForComposer();
    } else {
       document.addEventListener('DOMContentLoaded', observeForComposer);
    }
    // --- END: Call the observer setup ---
  }
});