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

      // --- PRIORITY 1: Check for local file preview (Data URL) ---
      const dataUrlImage = container.querySelector('img[src^="data:image/"]');
      if (dataUrlImage) {
        console.log('Found image via data URL (local file preview):', dataUrlImage);
        const rect = dataUrlImage.getBoundingClientRect();
        // Basic sanity check for visibility/size
        if (rect.width > 30 && rect.height > 30 && dataUrlImage.offsetParent !== null) {
           return dataUrlImage;
        } else {
           console.warn('Data URL image found but seems hidden or too small, continuing search...');
        }
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
         console.error('Failed to find suitable media via scoring.');
      }

      return bestCandidate; // Return the highest scoring candidate or null
    };
    
    // Add the button to an alt text textarea
    function addGenerateButton(textarea) {
      console.log('addGenerateButton called for textarea:', textarea); 

      // Prevent adding multiple buttons
      if (textarea.dataset.geminiButtonAdded === 'true') {
        console.log('Button already added to this textarea, skipping.');
        return;
      }

      // Find the parent element that likely contains the post button and media
      // Use a more robust approach to find the container
      let container = findComposerContainer(textarea);
      
      if (!container) {
        console.error('Could not find a suitable container for the button near textarea:', textarea);
        return;
      }
      
      console.log('Found container:', container);
      
      // Check if button already exists
      if (container.querySelector(`#${BUTTON_ID}`)) {
        console.log('Button already exists in this container, skipping.');
        return;
      }

      // Create the button container for positioning
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.alignItems = 'center';
      buttonContainer.style.gap = '8px';
      buttonContainer.style.marginLeft = '8px';
      
      // Create the button with an icon
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text'; // Add tooltip
      
      // Use an SVG directly in the button for reliability
      button.innerHTML = `
        <svg width="20" height="20" viewBox="-5 -10 128 128" xmlns="http://www.w3.org/2000/svg">
          <path d="M 35.746,4 C 20.973,4 9,15.973 9,30.746 V 77.254 C 9,92.027 20.973,104 35.746,104 H 82.254 C 97.027,104 109,92.027 109,77.254 V 30.746 C 109,15.973 97.027,4 82.254,4 Z m -19.77,26.746 c 0,-10.918 8.8516,-19.77 19.77,-19.77 h 46.508 c 10.918,0 19.77,8.8516 19.77,19.77 v 46.508 c 0,10.918 -8.8516,19.77 -19.77,19.77 H 35.746 c -10.918,0 -19.77,-8.8516 -19.77,-19.77 z m 45.609,0.37891 c -1.082,-2.1055 -4.0898,-2.1055 -5.1719,0 l -4.3242,8.4219 c -1.668,3.2383 -4.3047,5.875 -7.543,7.543 l -8.4219,4.3242 c -2.1055,1.082 -2.1055,4.0898 0,5.1719 l 8.4219,4.3242 c 3.2383,1.668 5.875,4.3047 7.543,7.543 l 4.3242,8.4219 c 1.082,2.1055 4.0898,2.1055 5.1719,0 l 4.3242,-8.4219 c 1.668,-3.2383 4.3047,-5.875 7.543,-7.543 l 8.4219,-4.3242 c 2.1055,-1.082 2.1055,-4.0898 0,-5.1719 l -8.4219,-4.3242 c -3.2383,-1.668 -5.875,-4.3047 -7.543,-7.543 z" 
             fill="#323248" stroke="none" />
        </svg>
      `;
      
      // Style the button
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
      
      console.log('Button element created:', button);

      // Store the original SVG to restore it later
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

        // Find the media element (image or video)
        const mediaElement = findMediaElement(container);
        console.log('Media element found:', mediaElement);

        if (!mediaElement || !mediaElement.src) {
          console.error('Could not find media element or its src.');
          button.textContent = 'Error: No Media';
          setTimeout(() => {
            button.textContent = '';
            button.innerHTML = originalButtonContent;
            button.disabled = false;
          }, 2000);
          return;
        }

        const mediaUrl = mediaElement.src;
        const isVideo = mediaElement.tagName.toLowerCase() === 'video';
        console.log(`${isVideo ? 'Video' : 'Image'} URL:`, mediaUrl);

        try {
          console.log('Establishing connection to background script...');
          const port = safeChrome.runtime.connect({ name: "altTextGenerator" });
          console.log('Connection established.');
          button.textContent = 'Generating...'; // Update state

          // Listener for responses from the background script via this port
          port.onMessage.addListener((response) => {
            console.log('Message received from background via port:', response);

            if (response.altText) {
              textarea.value = response.altText;
              textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              console.log('Alt text inserted.');
              button.textContent = '✓ Done';
              
              // Show toast if enabled
              if (config.showToasts) {
                createToast('Alt text generated! Please review for accuracy before posting.', 'success');
              }
              
              setTimeout(() => {
                // Restore the icon after completion
                button.textContent = '';
                button.innerHTML = originalButtonContent;
                button.disabled = false;
              }, 1500);
            } else if (response.error) {
              console.error('Error generating alt text:', response.error);
              button.textContent = `Error: ${response.error.substring(0,20)}...`;
              
              if (config.showToasts) {
                createToast(`Error: ${response.error}`, 'error');
              }
              
              setTimeout(() => {
                // Restore the icon after error
                button.textContent = '';
                button.innerHTML = originalButtonContent;
                button.disabled = false;
              }, 3000);
            } else {
              // Handle unexpected message format
              console.error('Received unexpected message format from background:', response);
              button.textContent = 'Msg Format Error';
              setTimeout(() => {
                // Restore the icon after error
                button.textContent = '';
                button.innerHTML = originalButtonContent;
                button.disabled = false;
              }, 2000);
            }
            port.disconnect(); // Disconnect after receiving the response
          });

          // Listener for when the connection is disconnected unexpectedly
          port.onDisconnect.addListener(() => {
            console.error('Background port disconnected unexpectedly.', chrome.runtime.lastError || '(No error info)');
            // Only update button if it hasn't already shown success/error
            if (!button.textContent.includes('Done') && !button.textContent.includes('Error')) {
              button.textContent = 'Disconnect Error';
              setTimeout(() => {
                // Restore the icon after error
                button.textContent = '';
                button.innerHTML = originalButtonContent;
                button.disabled = false;
              }, 3000);
            }
          });

          // Send the message to the background script via the port
          console.log('Sending message via port...');
          port.postMessage({ 
            action: 'generateAltText', 
            imageUrl: mediaUrl,
            isVideo: isVideo 
          });
          console.log('Message sent via port.');

        } catch (error) {
          // Catch errors related to establishing the connection itself
          console.error('Error establishing connection or posting initial message:', error);
          button.textContent = 'Connect Error';
          setTimeout(() => {
            // Restore the icon after error
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
        console.log('Generate Alt Text button clicked');
        await generateAltText();
      };

      // Append the button container - Try appending as the last child of the parent
      const parent = textarea.parentNode;
      if (parent) {
        console.log('Attempting to append button container to parent:', parent);
        parent.appendChild(buttonContainer);
      } else {
        console.error('Could not find parent node to append button to.');
      }
      
      // Mark the textarea so we don't add the button again
      textarea.dataset.geminiButtonAdded = 'true'; 
      
      console.log('Button insertion attempted. Check the DOM.');
    }
    
    // Helper function to find the composer container from a textarea or any element within it
    function findComposerContainer(element) {
      console.log('Finding composer container for element:', element);

      // Priority 1: Find the closest modal dialog containing the element
      const modalDialog = element.closest('[role="dialog"][aria-modal="true"]');
      if (modalDialog) {
        console.log('Found modal dialog container:', modalDialog);
        // Check if it seems valid (contains the element AND either image preview OR post button)
        if (modalDialog.contains(element) &&
            (modalDialog.querySelector('[data-testid="imagePreview"], [data-testid="images"]') ||
             modalDialog.querySelector('button[aria-label*="Post"], button[type="submit"]'))) {
           console.log('Modal dialog seems valid (contains element + preview/post button), returning it.');
           return modalDialog;
        } else {
           console.warn('Modal dialog found, but structure seems unexpected. Continuing search...');
           // Don't return modalDialog yet if it doesn't seem right
        }
      }

      // Priority 2: Look for a data-testid="composer" ancestor
      const testIdComposer = element.closest('[data-testid="composer"]');
      if (testIdComposer) {
        console.log('Found container via data-testid="composer":', testIdComposer);
        // Check if it seems valid (contains the element AND either image preview OR post button)
        if (testIdComposer.contains(element) &&
            (testIdComposer.querySelector('[data-testid="imagePreview"], [data-testid="images"]') ||
             testIdComposer.querySelector('button[aria-label*="Post"], button[type="submit"]'))) {
           console.log('Composer with test ID seems valid.');
           return testIdComposer;
        }
         console.warn('Found data-testid="composer", but structure seems unexpected. Continuing search...');
      }

      // Priority 3: Strict Fallback - Walk up looking for the *lowest* common ancestor
      // containing the original element, a reliable image preview indicator, AND action buttons.
      console.log('Modal or testid composer not found directly. Walking up DOM for strict common ancestor...');
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

              console.log('Found potential common ancestor with element, preview, and buttons:', current);
              commonAncestor = current; // Store this level as a potential candidate

              // Check if the *parent* also contains all three. If not, this 'current' is the lowest common ancestor.
              const parent = current.parentElement;
              if (!parent || parent.tagName === 'BODY' ||
                  !parent.contains(element) ||
                  !parent.querySelector(imagePreviewSelector) ||
                  !parent.querySelector(actionButtonSelector)) {

                 console.log('Parent does not contain all three, selecting current as lowest common ancestor:', commonAncestor);
                 break; // Found the boundary
              }
              // If parent also contains all, continue up to find the *actual* lowest
          }
          maxDepth--;
          current = current.parentElement;
      }

      if (commonAncestor) {
          console.log('Returning lowest common ancestor found:', commonAncestor);
          return commonAncestor;
      }

      // Last Resort: If absolutely nothing worked, use the modal if found initially, otherwise a simple parent
      console.error('Could not find a reliable common ancestor. Using initial modal or fallback parent.');
      // Return modalDialog only if it was found initially, otherwise fallback
      return modalDialog || element.parentElement?.parentElement || element.parentElement;
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