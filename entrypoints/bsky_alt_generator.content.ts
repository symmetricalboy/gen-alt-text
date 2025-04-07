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
            let configChanged = false;
            if (changes.autoMode) { 
                config.autoMode = changes.autoMode.newValue; 
                configChanged = true; 
                console.log('[Storage Listener] autoMode changed to:', config.autoMode);
            }
            if (changes.showToasts) { 
                config.showToasts = changes.showToasts.newValue; 
                configChanged = true; // Although this doesn't affect observers, mark change
                console.log('[Storage Listener] showToasts changed to:', config.showToasts);
            }
            // If autoMode changed, re-evaluate which observer should be active
            if (changes.autoMode) {
                observeDOMChanges(); 
            }
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
    
    // --- START: Auto Mode Helper Functions ---
    
    // Function to find the button that opens the alt text input for a given media element
    const findAltTextTriggerButton = (mediaElement: Element): HTMLButtonElement | null => {
      // Search hierarchy: near the media, then in its composer container
      const searchAreas: (Element | null)[] = [
        mediaElement.closest('[data-testid="imagePreview"]'), // Common image preview container
        mediaElement.closest('[data-testid="videoPreview"]'), // Common video preview container
        mediaElement.closest('[data-testid*="composer"]'), // General composer area
        document.body // Fallback: Search the whole body (less reliable)
      ];

      const buttonSelectors = [
        'button[aria-label*="alt text" i]',
        'button[title*="alt text" i]',
        'button:has(svg[aria-label*="alt" i])', // Button containing an icon with "alt" label
        'button:contains("ALT")', // Button with text "ALT"
        'button:contains("Add alt text")'
      ];

      for (const area of searchAreas) {
        if (!area) continue;
        for (const selector of buttonSelectors) {
          try {
            const button = area.querySelector<HTMLButtonElement>(selector);
            if (button && button.offsetParent !== null) { // Check if visible
              console.log(`[findAltTextTriggerButton] Found button with selector "${selector}" near`, mediaElement, button);
              return button;
            }
          } catch (e) { /* Ignore invalid selectors */ }
        }
      }
      console.warn('[findAltTextTriggerButton] Could not find alt text trigger button for', mediaElement);
      return null;
    };

    // Helper to safely click an element
    const clickElement = (element: HTMLElement | null) => {
      if (element && typeof element.click === 'function') {
        console.log('[clickElement] Clicking:', element);
        element.click();
        return true;
      } else {
        console.warn('[clickElement] Element not found or not clickable:', element);
        return false;
      }
    };

    // Function to wait for the alt text input to appear and then trigger our generation button
    const waitForAltTextInputAndGenerate = (triggerButton: HTMLElement) => {
        console.log('[waitForAltTextInputAndGenerate] Waiting for alt text input after clicking:', triggerButton);
        const checkInterval = 100; // Check every 100ms
        const maxWaitTime = 5000; // Wait max 5 seconds
        let timeWaited = 0;

        const intervalId = setInterval(() => {
            timeWaited += checkInterval;
            
            // Look for the alt text textarea, likely within a dialog opened by the trigger button
            const altTextDialog = document.querySelector('[role="dialog"] [aria-label*="alt text" i]'); // Common pattern
            let altTextArea: HTMLTextAreaElement | null = null;
            if(altTextDialog) {
                altTextArea = altTextDialog.querySelector('textarea');
            }
            // Fallback: Search anywhere (less reliable)
            if (!altTextArea) {
                 altTextArea = document.querySelector<HTMLTextAreaElement>(ALT_TEXT_SELECTOR);
            }

            if (altTextArea && altTextArea.offsetParent !== null) { // Found and visible
                console.log('[waitForAltTextInputAndGenerate] Found alt text textarea:', altTextArea);
                clearInterval(intervalId);
                
                // Now find *our* generate button associated with this textarea
                // It might not be added yet, so wait briefly if needed
                let generateButton: HTMLButtonElement | null = altTextArea.parentElement?.querySelector(`#${BUTTON_ID}`) || null;
                
                if (generateButton && generateButton.offsetParent !== null) {
                    console.log('[waitForAltTextInputAndGenerate] Found our generate button, clicking:', generateButton);
                    clickElement(generateButton);
                } else {
                    // Button might need a moment to be injected by the other observer
                    console.warn('[waitForAltTextInputAndGenerate] Generate button not immediately found, will retry shortly...');
                    setTimeout(() => {
                        const finalTryButton = altTextArea?.parentElement?.querySelector<HTMLButtonElement>(`#${BUTTON_ID}`);
                        if(finalTryButton && finalTryButton.offsetParent !== null) {
                            console.log('[waitForAltTextInputAndGenerate] Found generate button on retry, clicking:', finalTryButton);
                            clickElement(finalTryButton);
                        } else {
                             console.error('[waitForAltTextInputAndGenerate] Failed to find our generate button near textarea after retry:', altTextArea);
                        }
                    }, 500); // Wait 500ms more
                }
            } else if (timeWaited >= maxWaitTime) {
                console.error('[waitForAltTextInputAndGenerate] Timed out waiting for alt text textarea.');
                clearInterval(intervalId);
            }
        }, checkInterval);
    };

    // Observer specifically for Auto Mode: Watches for new media additions
    let autoModeMediaObserver: MutationObserver | null = null;
    const observeMediaForAutoMode = () => {
      if (autoModeMediaObserver) autoModeMediaObserver.disconnect(); // Disconnect previous if exists

      console.log('[observeMediaForAutoMode] Starting observer for media additions.');
      autoModeMediaObserver = new MutationObserver((mutations) => {
        if (!config.autoMode) return; // Double check config

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                // Check if the node itself is media or contains media
                const mediaElements = (node.matches('img[src], video[src]'))
                  ? [node as HTMLImageElement | HTMLVideoElement] 
                  : Array.from(node.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img[src], video[src]'));

                mediaElements.forEach((mediaElement) => {
                  // Basic check: Avoid tiny icons/avatars, ensure it has dimensions
                  if (mediaElement.offsetWidth < 50 || mediaElement.offsetHeight < 50 || mediaElement.closest('[data-testid*="avatar"]')) {
                    console.log('[observeMediaForAutoMode] Skipping small/avatar media:', mediaElement);
                    return;
                  }
                  
                  // Avoid processing if already handled (e.g., multiple mutations for same element)
                  if ((mediaElement as any)._autoAltTriggered) return;
                  (mediaElement as any)._autoAltTriggered = true; // Mark as handled
                  console.log('[observeMediaForAutoMode] Detected new media:', mediaElement);

                  // Find and click the "Add Alt Text" button for this media
                  const altTriggerButton = findAltTextTriggerButton(mediaElement);
                  if (clickElement(altTriggerButton)) {
                    // If click succeeded, wait for the input and trigger generation
                    waitForAltTextInputAndGenerate(altTriggerButton!); // We know it's not null if click succeeded
                  }
                  
                  // Cleanup the flag after a delay to allow reprocessing if needed (e.g., UI redraws)
                  setTimeout(() => { delete (mediaElement as any)._autoAltTriggered; }, 3000);
                });
              }
            });
          }
        }
      });

      // Observe the entire body, looking for nodes added anywhere
      autoModeMediaObserver.observe(document.body, { childList: true, subtree: true });
      console.log('[observeMediaForAutoMode] Observer attached to document body.');
    };
    
    // --- END: Auto Mode Helper Functions ---

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

      // --- START: Find the container where the TEXTAREA lives --- 
      const contextContainer = findComposerContainer(textarea);
      if (!contextContainer) {
          console.error('[addGenerateButton] Could not find the context container (composePostView, Add alt text, or Video settings) for the textarea. Button not added.');
          return; 
      }
      console.log('[addGenerateButton] Found context container for textarea:', contextContainer);
      // --- END: Find the container where the TEXTAREA lives ---

      // --- START: Determine the container where the MEDIA element lives ---
      let mediaSearchContainer: Element | null = null;
      if (contextContainer.matches('[aria-label="Video settings"]')) {
          // If context is video settings, media is in the main composePostView, which is NOT an ancestor.
          // Search the whole document for the main composer view.
          console.log('[addGenerateButton] Context is "Video settings", searching document for [data-testid="composePostView"]...');
          mediaSearchContainer = document.querySelector('[data-testid="composePostView"]'); // Find the active composer view in the document
          if (!mediaSearchContainer) {
               console.error('[addGenerateButton] Context is "Video settings", but failed to find [data-testid="composePostView"] in the document for media search.');
               return; // Cannot proceed without media container
          } 
          console.log('[addGenerateButton] Context is "Video settings", found composePostView in document for media search:', mediaSearchContainer);
      } else {
          // If context is composePostView or Add alt text (for images), media is within that context
          mediaSearchContainer = contextContainer;
          console.log('[addGenerateButton] Context is composePostView or Add alt text, targeting context container for media search:', mediaSearchContainer);
      }
      // --- END: Determine the container where the MEDIA element lives ---

      // Check if a button ALREADY exists within the determined *media search container*
      // (Button might be associated with the overall composer even if triggered from a modal)
      if (mediaSearchContainer.querySelector(`#${BUTTON_ID}`)) {
         console.log('[addGenerateButton] Button already exists in the media search container, marking textarea and skipping UI creation.');
         textarea.dataset.geminiButtonAdded = 'true'; // Still mark the textarea
         return;
      }
      
      // Find a good place to physically *attach* the button UI (near the textarea)
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
      // --- START: Use img tag for icon ---
      const iconUrl = browser.runtime.getURL("/icon/gen-alt-text.svg"); 
      button.innerHTML = `<img src="${iconUrl}" alt="Generate Alt Text Icon" width="20" height="20" style="display: block;">`;
      // --- END: Use img tag for icon ---
      Object.assign(button.style, {
          marginLeft: '8px', padding: '4px', cursor: 'pointer', border: '1px solid #ccc',
          borderRadius: '4px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center',
          justifyContent: 'center'
      });
      button.style.setProperty('visibility', 'visible', 'important');
      button.style.setProperty('z-index', '9999', 'important');
      button.style.setProperty('position', 'relative', 'important');

      // --- START: Update originalButtonContent ---
      const originalButtonContent = button.innerHTML; // Update this *after* setting the innerHTML
      // --- END: Update originalButtonContent ---

      // --- START: Remove Auto Toggle ---
      /*
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
      */
      // --- END: Remove Auto Toggle ---
      
      buttonContainer.appendChild(button);
      // --- START: Remove Auto Toggle Append ---
      // buttonContainer.appendChild(autoToggle);
      // --- END: Remove Auto Toggle Append ---

      const generateAltText = async () => {
        button.innerHTML = '';
        button.textContent = 'Finding Media...';
        button.style.color = '#000000'; // Set text color for status
        button.disabled = true;

        // --- IMPORTANT: Use the mediaSearchContainer determined earlier for the search --- 
        if (!mediaSearchContainer) { // Should not happen due to checks above, but safety first
            console.error('[generateAltText] mediaSearchContainer is null! Cannot search for media.');
            button.textContent = 'Error: Internal';
            button.style.color = '#000000'; // Set text color for status
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; // Clear text color
                button.disabled = false; 
            }, 3000);
            return;
        }
        console.log('[generateAltText] Searching for media within determined media search container:', mediaSearchContainer);
        const mediaElement = findMediaElement(mediaSearchContainer);
        // --- End search context change ---
        
        console.log('[generateAltText] Media element found in search container:', mediaElement);

        if (!mediaElement || !(mediaElement instanceof HTMLImageElement || mediaElement instanceof HTMLVideoElement)) {
            console.error('[generateAltText] Could not find valid media element.');
            button.textContent = 'Error: No Media';
            button.style.color = '#000000'; // Set text color for status
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; // Clear text color
                button.disabled = false; 
            }, 2000);
            return;
        }

        // --- START: Use helper to get Data URL ---
        button.textContent = 'Processing Media...';
        button.style.color = '#000000'; // Set text color for status
        const dataUrl = await getMediaAsDataUrl(mediaElement);

        if (!dataUrl) {
             console.error('[generateAltText] Failed to get media as Data URL.');
             button.textContent = 'Error: Process Fail';
             button.style.color = '#000000'; // Set text color for status
             setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; // Clear text color
                button.disabled = false; 
             }, 3000);
             return;
        }
        // --- END: Use helper to get Data URL ---

        // const mediaUrl = mediaElement.src; // No longer needed directly
        const isVideo = mediaElement.tagName === 'VIDEO';
        console.log(`[generateAltText] Got ${isVideo ? 'Video' : 'Image'} as Data URL (length: ${dataUrl.length})`);

        try {
            console.log('[generateAltText] Connecting to background...');
            button.textContent = 'Connecting...'; // Reset status before connect
            button.style.color = '#000000'; // Set text color for status
            // Use browser.runtime.connect
            const port = browser.runtime.connect({ name: "altTextGenerator" });
            console.log('[generateAltText] Connection established.');
            button.textContent = 'Generating...';
            button.style.color = '#000000'; // Set text color for status

            port.onMessage.addListener((response: any) => {
              console.log('[generateAltText] Msg from background:', response);
              let statusText = '';
              let isError = false;
              
              if (response.altText) {
                textarea.value = response.altText;
                textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                statusText = '✓ Done';
                if (config.showToasts) createToast(
                  'Alt text generated! 🤖 Double-check it before posting, AI can make mistakes.',
                  'success', 
                  8000 // Increased duration to 8 seconds
                ); 
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
              button.style.color = '#000000'; // Set text color for status
              setTimeout(() => {
                  button.innerHTML = originalButtonContent;
                  button.style.color = ''; // Clear text color
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
                button.style.color = '#000000'; // Set text color for status
                setTimeout(() => { 
                    button.innerHTML = originalButtonContent; 
                    button.style.color = ''; // Clear text color
                    button.disabled = false; 
                }, 3000);
              }
            });

            console.log('[generateAltText] Sending message...');
            // Send the dataUrl obtained from the helper
            port.postMessage({ action: 'generateAltText', imageUrl: dataUrl, isVideo: isVideo });
            console.log('[generateAltText] Message sent.');

          } catch (error: unknown) {
            console.error('[generateAltText] Connect/Post error:', error);
            button.textContent = 'Connect Error';
            button.style.color = '#000000'; // Set text color for status
            setTimeout(() => { 
                button.innerHTML = originalButtonContent; 
                button.style.color = ''; // Clear text color
                button.disabled = false; 
            }, 2000);
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
          '[aria-label="Add alt text"]',      // Container when adding image alt text (likely a dialog/modal)
          '[aria-label="Video settings"]'     // Container when adding video alt text
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
    
    // --- START: Refactor Manual Mode Observer ---
    let manualModeObserver: MutationObserver | null = null;
    const observeAltTextAreas = () => {
      if (manualModeObserver) manualModeObserver.disconnect(); // Disconnect previous
      console.log('[observeAltTextAreas] Starting observer for manual button injection.');
      
      // Initial check for existing textareas
      document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);

      manualModeObserver = new MutationObserver((mutations) => {
        if (config.autoMode) return; // Stop if switched to auto mode

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node instanceof HTMLElement) {
                // Check if the added node itself is a textarea
                if (node.matches(ALT_TEXT_SELECTOR)) {
                   addGenerateButton(node as HTMLTextAreaElement);
                }
                // Check if the added node contains textareas
                node.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR)
                  .forEach(addGenerateButton);
              }
            });
          }
          // Also observe attribute changes that might make a textarea match (less common)
          if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && mutation.target.matches(ALT_TEXT_SELECTOR)) {
             addGenerateButton(mutation.target as HTMLTextAreaElement);
          }
        }
      });

      manualModeObserver.observe(document.body, { 
          childList: true, 
          subtree: true, 
          attributes: true, 
          attributeFilter: ['aria-label', 'placeholder', 'data-testid', 'role'] // Attributes used in ALT_TEXT_SELECTOR
      });
      console.log('[observeAltTextAreas] Observer attached to document body.');
    };
    // --- END: Refactor Manual Mode Observer ---
    
    // --- START: Main Observer Dispatcher ---
    const observeDOMChanges = () => {
        console.log('[observeDOMChanges] Evaluating mode. Auto Mode is currently:', config.autoMode);
        if (config.autoMode) {
            // Start Auto Mode Observer, Stop Manual Mode Observer
            if (manualModeObserver) {
                console.log('[observeDOMChanges] Disconnecting manualModeObserver.');
                manualModeObserver.disconnect();
            }
            observeMediaForAutoMode();
        } else {
            // Start Manual Mode Observer, Stop Auto Mode Observer
            if (autoModeMediaObserver) {
                console.log('[observeDOMChanges] Disconnecting autoModeMediaObserver.');
                autoModeMediaObserver.disconnect();
            }
            observeAltTextAreas();
        }
    };
    // --- END: Main Observer Dispatcher ---
    
    // Initial DOM Observation Start (moved after config load and observer definitions)
    // loadConfig already calls observeDOMChanges implicitly via the listener on first load,
    // but explicit call ensures it runs even if storage is empty/no change event fires initially.
    // We need to wait for config to be loaded first.
    loadConfig().then(() => {
        console.log('[Initial Setup] Config loaded, initiating observeDOMChanges.');
        observeDOMChanges();
    });
    
    console.log('Bluesky Alt Text Generator content script setup complete.');
  }
});