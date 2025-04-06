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
    
    // Configuration (will be controlled by popup)
    let config = {
      autoMode: false,
      showToasts: true
    };
    
    // Helper function to safely access chrome APIs
    const safeChrome = {
      storage: {
        sync: {
          get: (keys, callback) => {
            try {
              if (chrome?.storage?.sync) {
                chrome.storage.sync.get(keys, callback);
              } else {
                console.warn('Chrome storage API not available, using default values');
                callback({});
              }
            } catch (error) {
              console.error('Error accessing chrome.storage.sync.get:', error);
              callback({});
            }
          },
          set: (items) => {
            try {
              if (chrome?.storage?.sync) {
                chrome.storage.sync.set(items);
              } else {
                console.warn('Chrome storage API not available, cannot save settings');
              }
            } catch (error) {
              console.error('Error accessing chrome.storage.sync.set:', error);
            }
          }
        }
      },
      runtime: {
        connect: (options) => {
          try {
            if (chrome?.runtime?.connect) {
              return chrome.runtime.connect(options);
            } else {
              console.error('Chrome runtime API not available');
              throw new Error('Chrome runtime API not available');
            }
          } catch (error) {
            console.error('Error connecting to background script:', error);
            throw error;
          }
        },
        onChanged: {
          addListener: (callback) => {
            try {
              if (chrome?.storage?.onChanged) {
                chrome.storage.onChanged.addListener(callback);
              } else {
                console.warn('Chrome storage.onChanged API not available');
              }
            } catch (error) {
              console.error('Error adding onChanged listener:', error);
            }
          }
        }
      }
    };
    
    // Try to load config from storage
    safeChrome.storage.sync.get(['autoMode', 'showToasts'], (result) => {
      if (result.autoMode !== undefined) config.autoMode = result.autoMode;
      if (result.showToasts !== undefined) config.showToasts = result.showToasts;
      console.log('Loaded config:', config);
    });
    
    // Listen for config changes
    safeChrome.runtime.onChanged.addListener((changes) => {
      if (changes.autoMode) config.autoMode = changes.autoMode.newValue;
      if (changes.showToasts) config.showToasts = changes.showToasts.newValue;
      console.log('Updated config:', config);
    });
    
    // Toast notification system
    const createToast = (message, type = 'info', duration = 5000) => {
      // Create toast container if it doesn't exist
      let toastContainer = document.getElementById('gemini-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'gemini-toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.bottom = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '10000';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.gap = '10px';
        document.body.appendChild(toastContainer);
      }
      
      // Create toast element
      const toast = document.createElement('div');
      toast.style.padding = '12px 16px';
      toast.style.borderRadius = '6px';
      toast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
      toast.style.margin = '5px';
      toast.style.minWidth = '200px';
      toast.style.color = '#ffffff';
      toast.style.fontSize = '14px';
      toast.style.transition = 'all 0.3s ease';
      
      // Set colors based on type
      if (type === 'success') {
        toast.style.backgroundColor = '#1da882';
      } else if (type === 'error') {
        toast.style.backgroundColor = '#e53935';
      } else if (type === 'warning') {
        toast.style.backgroundColor = '#f59f0b';
      } else {
        toast.style.backgroundColor = '#007eda';
      }
      
      toast.textContent = message;
      
      // Add close button
      const closeBtn = document.createElement('span');
      closeBtn.textContent = '×';
      closeBtn.style.marginLeft = '8px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.float = 'right';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.onclick = () => {
        toastContainer.removeChild(toast);
      };
      toast.appendChild(closeBtn);
      
      // Add to container and set timeout for removal
      toastContainer.appendChild(toast);
      setTimeout(() => {
        if (toastContainer.contains(toast)) {
          toastContainer.removeChild(toast);
        }
      }, duration);
    };
    
    // Function to check if an element is an image or video uploader
    const isMediaUploader = (element) => {
      // Check if it's an input with type=file that accepts images or videos
      if (element.tagName === 'INPUT' && 
          element.type === 'file' && 
          (element.accept?.includes('image') || element.accept?.includes('video'))) {
        return true;
      }
      
      // Check for common attributes used for upload buttons/areas
      if (element.getAttribute('data-testid')?.includes('upload') || 
          element.getAttribute('aria-label')?.includes('upload') ||
          element.getAttribute('role') === 'button' && 
          (element.textContent?.includes('image') || element.textContent?.includes('photo') || 
           element.textContent?.includes('video') || element.textContent?.includes('media'))) {
        return true;
      }
      
      return false;
    };
    
    // Function to find media elements in the composer
    const findMediaElement = (container) => {
      console.log('Searching for media in container:', container);

      // --- PRIORITY 1: Check for specific local file preview (Data URL within preview container) ---
      const specificDataUrlImage = container.querySelector('[data-testid="imagePreview"] img[src^="data:image/"], [data-testid="images"] img[src^="data:image/"]');
      if (specificDataUrlImage) {
        console.log('Found image via SPECIFIC data URL selector:', specificDataUrlImage);
        const rect = specificDataUrlImage.getBoundingClientRect();
        // Lowered threshold slightly for previews, check visibility
        if (rect.width > 10 && rect.height > 10 && specificDataUrlImage.offsetParent !== null) {
           console.log('Specific data URL image is valid, returning it.');
           return specificDataUrlImage;
        } else {
           console.warn('Specific data URL image found but seems hidden/too small. Rect:', rect, 'OffsetParent:', specificDataUrlImage.offsetParent);
        }
      } else {
         console.log('Did not find image via SPECIFIC data URL selector (e.g., [data-testid="imagePreview"] img[src^="data:image/"]).');
      }

      // --- PRIORITY 2: Check for ANY local file preview (Data URL) - Wider check as fallback ---
      const anyDataUrlImage = container.querySelector('img[src^="data:image/"]');
       if (anyDataUrlImage) {
        console.log('Found image via ANY data URL selector:', anyDataUrlImage);
        const rect = anyDataUrlImage.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10 && anyDataUrlImage.offsetParent !== null) {
           console.log('ANY data URL image is valid, returning it.');
           return anyDataUrlImage;
        } else {
           console.warn('ANY data URL image found but seems hidden/too small. Rect:', rect, 'OffsetParent:', anyDataUrlImage.offsetParent);
        }
      } else {
         console.log('Did not find image via ANY data URL selector.');
      }

      // --- Fallback to existing scoring logic if no data URL image found ---
      console.log('No valid data URL image found, proceeding to scoring logic...');
      const candidates = Array.from(container.querySelectorAll('img, video'));
      console.log(`Found ${candidates.length} candidates for scoring.`);

      // Get bounds of the composer/modal - NOTE: May be inaccurate if container is too large
      // const composerRect = container.getBoundingClientRect(); 
      let bestCandidate = null;
      let highestScore = -1;

      for (const el of candidates) {
        let currentScore = 0;
        const elRect = el.getBoundingClientRect();
        
        // --- Basic Checks & Filtering --- 
        
        // 0. Visibility Check (Must be rendered)
        // Basic Visibility Check
        if (elRect.width === 0 || elRect.height === 0 || el.offsetParent === null) {
           // console.log('Skipping candidate (not visible):', el);
           continue; 
        }

        if (el.tagName === 'VIDEO') {
          // Added check for data URL video as well
          if (el.src?.startsWith('data:video/') || el.src || el.querySelector('source[src]')) {
            console.log('Found video candidate:', el);
            currentScore = 1000; // High score for video
          } else {
            continue; // Skip video tags without src
          }
        } else { // Process IMG tags
          const img = el;
          const src = img.src || '';
          const alt = img.alt || '';

          // 1. Basic Exclusions (Avatars, invalid src)
          // Basic Exclusions (Avatars, already checked data URLs)
          if (!src || src.startsWith('data:') || alt.toLowerCase().includes('avatar') || src.includes('avatar') || src.includes('profile')) {
            // console.log('Skipping image (avatar/invalid src):', img);
            continue;
          }

          // 2. REMOVED Position Check - Was likely causing issues due to inaccurate container bounds
          /*
          const imgCenterX = elRect.left + elRect.width / 2;
          const imgCenterY = elRect.top + elRect.height / 2;
          if (imgCenterX < composerRect.left || imgCenterX > composerRect.right || imgCenterY < composerRect.top || imgCenterY > composerRect.bottom) {
              console.log('Skipping image: center point outside composer bounds.', img);
              continue; 
          }
          */
          
          // 3. Size Check 
          const minSize = 50;
          if (elRect.width < minSize || elRect.height < minSize) {
            // console.log(`Skipping image (too small: ${elRect.width}x${elRect.height}):`, img);
            continue;
          }
          
          // --- Scoring & Prioritization --- 
          currentScore = 1; // Base score for being a visible, non-avatar image
          console.log(`Valid image candidate found: ${elRect.width}x${elRect.height}`, img);

          // VERY HIGH boost if it's inside the *exact* preview structure
          const previewWrapper = img.closest('[data-testid="imagePreview"], .r-1p0dtai[style*="aspect-ratio"]'); // Keep using reliable non-generated selectors where possible
          if (previewWrapper) {
            console.log('Image is inside a high-priority preview wrapper, boosting score significantly.');
            currentScore += 500;
            
            // Check if the wrapper is directly within the main container (not deeply nested)
            // This check might be less useful now that container finding is less reliable
            // if (previewWrapper.parentElement === container || previewWrapper.parentElement?.parentElement === container) {
            //    console.log('Preview wrapper is close to container root, further boost.');
            //    currentScore += 50;
            // }
          }
          
          // Moderate boost for other relevant test IDs or roles if not already boosted
          if (currentScore <= 1 && img.matches('[data-testid*="image"], [data-testid*="preview"], [role="img"]')) {
             console.log('Image has a relevant test ID/role, boosting score.');
             currentScore += 50;
          }
          
          // Penalize if it looks like it's part of a background post structure
          // Compare closest post container of image vs closest post container of the main container
          const imgPostContainer = img.closest('[data-testid="postView"], [role="article"]');
          const mainPostContainer = container.closest('[data-testid="postView"], [role="article"]');
          if (imgPostContainer && mainPostContainer && imgPostContainer !== mainPostContainer) {
               console.log('Image seems to be inside a *different* post structure, penalizing score.');
               currentScore = Math.max(0, currentScore - 100); // Stronger penalty
          }
          
          // Slight boost for larger images
          currentScore += Math.min(5, Math.floor(elRect.width / 100)); 
        }
        
        // --- Selection --- 
        console.log('Candidate score:', currentScore, el);
        if (currentScore > highestScore) {
            highestScore = currentScore;
            bestCandidate = el;
            console.log('New best candidate selected with score:', highestScore, bestCandidate);
        }
      }
      
      if (bestCandidate) {
        console.log('Final selected best candidate (from scoring):', bestCandidate);
      } else {
         console.error('Failed to find a suitable media candidate within the container after scoring (Highest score <= 0).');
         // Added more specific error for scoring failure
         console.error('SCORING FAILED: No suitable media candidate found via scoring logic.');
      }

      return bestCandidate; // Return the highest scoring candidate or null
    };
    
    // Add the button to an alt text textarea
    function addGenerateButton(textarea) {
      console.log('[addGenerateButton] Starting for textarea:', textarea);

      // Prevent adding multiple buttons
      if (textarea.dataset.geminiButtonAdded === 'true') {
        console.log('[addGenerateButton] Button already added, skipping.');
        return;
      }

      // --- Find the Shared Parent Container ---
      // Based on the structure: textarea -> textAreaContainer -> sharedParentContainer
      const textAreaContainer = textarea.parentElement;
      let container; // Define container variable
      const sharedParentContainer = textAreaContainer?.parentElement;

      if (!sharedParentContainer) {
          console.error('[addGenerateButton] Could not find expected sharedParentContainer (parent of textarea's parent). Cannot proceed.');
          // As a fallback, try the complex container finder just in case structure changed slightly
          const fallbackContainer = findComposerContainer(textarea);
          if (!fallbackContainer) {
              console.error('[addGenerateButton] Fallback container finder also failed.');
              return;
          }
          console.warn('[addGenerateButton] Using fallback container:', fallbackContainer);
          // If using fallback, we proceed but might face the same issues as before
          // Reassign container for the rest of the function
          container = fallbackContainer;
      } else {
           console.log('[addGenerateButton] Found sharedParentContainer:', sharedParentContainer);
           // Use this specifically found container for the rest of the operations
           container = sharedParentContainer;
      }


      // Check if button already exists within the determined container
      if (container.querySelector(`#${BUTTON_ID}`)) {
        console.log('[addGenerateButton] Button already exists in this container, skipping.');
        return;
      }

      // Create the button container for positioning (append near textarea)
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.alignItems = 'center';
      buttonContainer.style.gap = '8px';
      buttonContainer.style.marginLeft = '8px';


      // Create the button with an icon
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text';
      button.innerHTML = `
        <svg width="20" height="20" viewBox="-5 -10 128 128" xmlns="http://www.w3.org/2000/svg">
          <path d="M 35.746,4 C 20.973,4 9,15.973 9,30.746 V 77.254 C 9,92.027 20.973,104 35.746,104 H 82.254 C 97.027,104 109,92.027 109,77.254 V 30.746 C 109,15.973 97.027,4 82.254,4 Z m -19.77,26.746 c 0,-10.918 8.8516,-19.77 19.77,-19.77 h 46.508 c 10.918,0 19.77,8.8516 19.77,19.77 v 46.508 c 0,10.918 -8.8516,19.77 -19.77,19.77 H 35.746 c -10.918,0 -19.77,-8.8516 -19.77,-19.77 z m 45.609,0.37891 c -1.082,-2.1055 -4.0898,-2.1055 -5.1719,0 l -4.3242,8.4219 c -1.668,3.2383 -4.3047,5.875 -7.543,7.543 l -8.4219,4.3242 c -2.1055,1.082 -2.1055,4.0898 0,5.1719 l 8.4219,4.3242 c 3.2383,1.668 5.875,4.3047 7.543,7.543 l 4.3242,8.4219 c 1.082,2.1055 4.0898,2.1055 5.1719,0 l 4.3242,-8.4219 c 1.668,-3.2383 4.3047,-5.875 7.543,-7.543 l 8.4219,-4.3242 c 2.1055,-1.082 2.1055,-4.0898 0,-5.1719 l -8.4219,-4.3242 c -3.2383,-1.668 -5.875,-4.3047 -7.543,-7.543 z"
             fill="#323248" stroke="none" />
        </svg>
      `;
      button.style.marginLeft = '8px';
      button.style.padding = '4px';
      button.style.cursor = 'pointer';
      button.style.border = '1px solid #ccc';
      button.style.borderRadius = '4px';
      button.style.backgroundColor = '#f0f0f0';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.setProperty('visibility', 'visible', 'important');
      button.style.setProperty('z-index', '9999', 'important');
      button.style.setProperty('position', 'relative', 'important');

      const originalButtonContent = button.innerHTML;

      // Create auto-mode toggle
      const autoToggle = document.createElement('label');
      autoToggle.className = 'gemini-auto-toggle';
      autoToggle.title = 'Auto-generate alt text when media is added';
      autoToggle.style.display = 'flex';
      autoToggle.style.alignItems = 'center';
      autoToggle.style.fontSize = '12px';
      autoToggle.style.cursor = 'pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.margin = '0 4px 0 0';
      checkbox.checked = config.autoMode;
      checkbox.addEventListener('change', (e) => {
        config.autoMode = e.target.checked;
        safeChrome.storage.sync.set({ autoMode: config.autoMode });
      });

      autoToggle.appendChild(checkbox);
      autoToggle.appendChild(document.createTextNode('Auto'));

      buttonContainer.appendChild(button);
      buttonContainer.appendChild(autoToggle);

      // Function to generate alt text
      const generateAltText = async () => {
        button.innerHTML = ''; // Clear icon
        button.textContent = 'Connecting...'; // Update initial state
        button.disabled = true;

        // Find the media element (image or video) *within the specific container*
        // **CRITICAL CHANGE**: Pass the specific `container` found earlier
        const mediaElement = findMediaElement(container);
        console.log('[generateAltText] Media element found within container:', mediaElement); // Changed log

        if (!mediaElement || !mediaElement.src) {
            console.error('[generateAltText] Could not find media element or its src within the designated container.');
            button.textContent = 'Error: No Media Found'; // More specific error
            setTimeout(() => {
              button.textContent = '';
              button.innerHTML = originalButtonContent;
              button.disabled = false;
            }, 2000);
            return;
          }

          const mediaUrl = mediaElement.src;
          const isVideo = mediaElement.tagName.toLowerCase() === 'video';
          console.log(`[generateAltText] ${isVideo ? 'Video' : 'Image'} URL:`, mediaUrl);

          try {
            console.log('[generateAltText] Establishing connection to background script...');
            const port = safeChrome.runtime.connect({ name: "altTextGenerator" });
            console.log('[generateAltText] Connection established.');
            button.textContent = 'Generating...'; // Update state

            port.onMessage.addListener((response) => {
              console.log('[generateAltText] Message received from background via port:', response);

              if (response.altText) {
                textarea.value = response.altText;
                textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                console.log('[generateAltText] Alt text inserted.');
                button.textContent = '✓ Done';

                if (config.showToasts) {
                  createToast('Alt text generated! Please review for accuracy before posting.', 'success');
                }

                setTimeout(() => {
                  button.textContent = '';
                  button.innerHTML = originalButtonContent;
                  button.disabled = false;
                }, 1500);
              } else if (response.error) {
                console.error('[generateAltText] Error generating alt text:', response.error);
                button.textContent = `Error: ${response.error.substring(0,20)}...`;

                if (config.showToasts) {
                  createToast(`Error: ${response.error}`, 'error');
                }

                setTimeout(() => {
                  button.textContent = '';
                  button.innerHTML = originalButtonContent;
                  button.disabled = false;
                }, 3000);
              } else {
                console.error('[generateAltText] Received unexpected message format from background:', response);
                button.textContent = 'Msg Format Error';
                setTimeout(() => {
                  button.textContent = '';
                  button.innerHTML = originalButtonContent;
                  button.disabled = false;
                }, 2000);
              }
              // Ensure disconnect happens *after* processing the message
              port.disconnect(); 
            });

            port.onDisconnect.addListener(() => {
              console.error('[generateAltText] Background port disconnected unexpectedly.', chrome.runtime.lastError || '(No error info)');
              if (!button.textContent.includes('Done') && !button.textContent.includes('Error')) {
                button.textContent = 'Disconnect Error';
                setTimeout(() => {
                  button.textContent = '';
                  button.innerHTML = originalButtonContent;
                  button.disabled = false;
                }, 3000);
              }
            });

            console.log('[generateAltText] Sending message via port...');
            port.postMessage({
              action: 'generateAltText',
              imageUrl: mediaUrl,
              isVideo: isVideo
            });
            console.log('[generateAltText] Message sent via port.');

          } catch (error) {
            console.error('[generateAltText] Error establishing connection or posting initial message:', error);
            button.textContent = 'Connect Error';
            setTimeout(() => {
              button.textContent = '';
              button.innerHTML = originalButtonContent;
              button.disabled = false;
            }, 2000);
          }
      };

      // Button click handler
      button.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[addGenerateButton] Generate Alt Text button clicked');
        await generateAltText();
      };

      // Append the button container near the textarea
      // Use textAreaContainer (the direct parent) for button placement
      if (textAreaContainer) {
        console.log('[addGenerateButton] Attempting to append button container to textAreaContainer:', textAreaContainer);
        textAreaContainer.appendChild(buttonContainer); // Append button near textarea
      } else {
        console.error('[addGenerateButton] Could not find textAreaContainer to append button to.');
      }

      // Mark the textarea so we don't add the button again
      textarea.dataset.geminiButtonAdded = 'true';

      console.log('[addGenerateButton] Button insertion attempted.');
    }
    
    // Helper function to find the composer container from a textarea or any element within it
    function findComposerContainer(element) {
      console.log('[findComposerContainer] Starting search for element:', element);

      // Priority 1: Find the closest modal dialog containing the element
      const modalDialog = element.closest('[role="dialog"][aria-modal="true"]');
      if (modalDialog) {
        console.log('[findComposerContainer] Found potential modal dialog:', modalDialog);
        // Check if it seems valid (contains the element AND either image preview OR post button)
        if (modalDialog.contains(element) &&
            (modalDialog.querySelector('[data-testid="imagePreview"], [data-testid="images"]') ||
             modalDialog.querySelector('button[aria-label*="Post"], button[type="submit"]'))) {
           console.log('[findComposerContainer] Returning: Priority 1 - Valid Modal Dialog');
           return modalDialog;
        } else {
           console.warn('[findComposerContainer] Modal dialog found, but validation failed. Continuing search...');
           // Don't return modalDialog yet if it doesn't seem right
        }
      } else {
          console.log('[findComposerContainer] Priority 1: No modal dialog found.');
      }

      // Priority 2: Look for a data-testid="composer" ancestor
      const testIdComposer = element.closest('[data-testid="composer"]');
      if (testIdComposer) {
        console.log('[findComposerContainer] Found potential data-testid="composer":', testIdComposer);
        // Check if it seems valid (contains the element AND either image preview OR post button)
        if (testIdComposer.contains(element) &&
            (testIdComposer.querySelector('[data-testid="imagePreview"], [data-testid="images"]') ||
             testIdComposer.querySelector('button[aria-label*="Post"], button[type="submit"]'))) {
           console.log('[findComposerContainer] Returning: Priority 2 - Valid Test ID Composer');
           return testIdComposer;
        } else {
           console.warn('[findComposerContainer] Test ID composer found, but validation failed. Continuing search...');
        }
      } else {
           console.log('[findComposerContainer] Priority 2: No data-testid="composer" found.');
      }


      // Priority 3: Strict Fallback - Walk up looking for the *lowest* common ancestor
      // containing the original element, a reliable image preview indicator, AND action buttons.
      console.log('[findComposerContainer] Entering Priority 3: Strict Lowest Common Ancestor search...');
      let current = element.parentElement;
      let maxDepth = 10;
      let commonAncestor = null;
      const imagePreviewSelector = '[data-testid="imagePreview"] img:not([alt*="avatar"]), [data-testid="images"] img:not([alt*="avatar"])'; // Use reliable test IDs
      const actionButtonSelector = 'button[aria-label*="Post"], button[type="submit"], button[aria-label*="Cancel"], button[aria-label*="Close"]';

      while (current && current.tagName !== 'BODY' && maxDepth > 0) {
          // Check if this level contains ALL: original element, image preview, AND action buttons
          if (current.contains(element) &&
              current.querySelector(imagePreviewSelector) &&
              current.querySelector(actionButtonSelector)) {

              console.log('[findComposerContainer] Found potential common ancestor:', current);
              commonAncestor = current; // Store this level as a potential candidate

              // Check if the *parent* also contains all three. If not, this 'current' is the lowest common ancestor.
              const parent = current.parentElement;
              if (!parent || parent.tagName === 'BODY' ||
                  !parent.contains(element) ||
                  !parent.querySelector(imagePreviewSelector) ||
                  !parent.querySelector(actionButtonSelector)) {

                 console.log('[findComposerContainer] Parent validation failed, selecting current as lowest common ancestor:', commonAncestor);
                 break; // Found the boundary
              }
              // If parent also contains all, continue up to find the *actual* lowest
          }
          maxDepth--;
          current = current.parentElement;
      }

      if (commonAncestor) {
          console.log('[findComposerContainer] Returning: Priority 3 - Lowest Common Ancestor');
          return commonAncestor;
      } else {
          console.log('[findComposerContainer] Priority 3: No suitable common ancestor found.');
      }

      // Last Resort:
      const fallback = modalDialog || testIdComposer || element.parentElement?.parentElement || element.parentElement; // Try modal/testid again before simple parent
      console.error('[findComposerContainer] Returning: Last Resort Fallback:', fallback);
      return fallback;
    }
    
    // Watch for media uploads to trigger auto-generation
    const observeMediaElements = () => {
      const mediaObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                // Check if this is a media element
                if ((element.tagName === 'IMG' || element.tagName === 'VIDEO') && 
                    !element.getAttribute('alt')?.includes('avatar')) {
                  console.log('Media element detected:', element);
                  
                  // If auto mode is enabled, find the closest alt text field and generate
                  if (config.autoMode) {
                    // First check if this is inside a composer
                    const container = element.closest('[data-testid="composer"], [role="dialog"], .css-175oi2r');
                    if (container) {
                      // Try to find the alt text field
                      setTimeout(() => {
                        // Wait a bit for alt text field to be added to the DOM
                        const textarea = container.querySelector(ALT_TEXT_SELECTOR) as HTMLTextAreaElement;
                        if (textarea) {
                          // Make sure our button is added
                          addGenerateButton(textarea);
                          
                          // Find the button and click it to trigger generation
                          const button = container.querySelector(`#${BUTTON_ID}`) as HTMLButtonElement;
                          if (button && !button.disabled) {
                            console.log('Auto-generating alt text for newly added media');
                            button.click();
                          }
                        } else {
                          console.log('No alt text field found for auto-generation');
                          // Try to observe for the alt text field appearing
                          const fieldWatcher = new MutationObserver((mutations) => {
                            for (const mutation of mutations) {
                              if (mutation.type === 'childList') {
                                const altTextArea = container.querySelector(ALT_TEXT_SELECTOR) as HTMLTextAreaElement;
                                if (altTextArea) {
                                  addGenerateButton(altTextArea);
                                  const button = container.querySelector(`#${BUTTON_ID}`) as HTMLButtonElement;
                                  if (button && !button.disabled) {
                                    console.log('Alt text field found after waiting, auto-generating');
                                    button.click();
                                    fieldWatcher.disconnect();
                                  }
                                }
                              }
                            }
                          });
                          
                          // Watch for the alt text field to appear
                          fieldWatcher.observe(container, { childList: true, subtree: true });
                          // Disconnect after 5 seconds to prevent indefinite observation
                          setTimeout(() => fieldWatcher.disconnect(), 5000);
                        }
                      }, 500);
                    }
                  }
                }
              }
            });
          }
        }
      });
      
      // Observe the whole document for media elements being added
      mediaObserver.observe(document.body, { childList: true, subtree: true });
    };
    
    // Process existing textareas
    document.querySelectorAll(ALT_TEXT_SELECTOR).forEach(textarea => {
      addGenerateButton(textarea as HTMLTextAreaElement);
    });
    
    // Watch for dynamically added textareas
    const observer = new MutationObserver(mutations => {
      console.log('MutationObserver callback triggered.'); // Log observer activity
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            // Check if the added node is an element
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element; // Type assertion
              // Check if it's the textarea itself
              if (element.matches && element.matches(ALT_TEXT_SELECTOR)) {
                console.log('Observer found matching textarea directly:', element);
                addGenerateButton(element as HTMLTextAreaElement);
              } 
              // Check if it contains any matching textareas
              else if (element.querySelectorAll) {
                element.querySelectorAll(ALT_TEXT_SELECTOR).forEach(textarea => {
                  console.log('Observer found matching textarea within added node:', textarea);
                  addGenerateButton(textarea as HTMLTextAreaElement);
                });
              }
            }
          });
        }
      }
    });
    
    // Start observing
    observer.observe(document.body, { childList: true, subtree: true });
    observeMediaElements();
  }
});