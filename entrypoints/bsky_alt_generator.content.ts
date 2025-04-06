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
      
      const candidates = Array.from(container.querySelectorAll('img, video'));
      console.log(`Found ${candidates.length} initial candidates (img/video) in container.`);

      const composerRect = container.getBoundingClientRect(); // Get bounds of the composer/modal
      let bestCandidate = null;
      let highestScore = -1;

      for (const el of candidates) {
        let currentScore = 0;
        
        // --- Basic Checks & Filtering --- 
        if (el.tagName === 'VIDEO') {
          if (el.src || el.querySelector('source[src]')) {
            console.log('Found video candidate:', el);
            // Videos are usually the primary media if present
            currentScore = 100; 
          } else {
            continue; // Skip video tags without src
          }
        } else { // Process IMG tags
          const img = el;
          const src = img.src || '';
          const alt = img.alt || '';

          // 1. Basic Exclusions
          if (!src || src.startsWith('data:') || alt.toLowerCase().includes('avatar') || src.includes('avatar') || src.includes('profile')) {
            continue;
          }

          // 2. Visibility & Position Check
          const rect = img.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || img.offsetParent === null) {
            continue; // Skip non-visible images
          }
          // Ensure the image is actually within the composer's visual bounds (simple check)
          // This helps filter out elements behind the modal that might still be in the DOM query
          if (rect.top < composerRect.top || rect.left < composerRect.left || rect.bottom > composerRect.bottom || rect.right > composerRect.right) {
             // console.log('Skipping image potentially outside composer bounds:', img);
             // continue; // Temporarily disable this check, might be too strict
          }

          // 3. Size Check 
          const minSize = 50;
          if (rect.width < minSize || rect.height < minSize) {
            continue;
          }
          
          // --- Scoring & Prioritization --- 
          currentScore = 1; // Base score for being a visible, non-avatar image
          console.log(`Valid image candidate found: ${rect.width}x${rect.height}`, img);

          // Boost score significantly if it's inside a known preview structure
          const previewWrapper = img.closest('[data-testid="imagePreview"], [data-testid="images"], .r-1p0dtai, [role="img"]');
          if (previewWrapper) {
            console.log('Image is inside a known preview wrapper, boosting score.');
            currentScore += 50;
          }
          
          // Boost score if it has specific test ids itself
          if(img.matches('[data-testid*="image"], [data-testid*="preview"]')) {
             console.log('Image has a relevant test ID, boosting score.');
             currentScore += 20;
          }
          
          // Slightly boost larger images within the composer
          currentScore += Math.min(5, Math.floor(rect.width / 100)); 
        }
        
        // --- Selection --- 
        if (currentScore > highestScore) {
            highestScore = currentScore;
            bestCandidate = el;
            console.log('New best candidate selected with score:', highestScore, bestCandidate);
        }
      }
      
      if (bestCandidate) {
        console.log('Final selected best candidate:', bestCandidate);
      } else {
         console.error('Failed to find a suitable media candidate within the container after scoring.');
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
      // This is the most reliable container for alt text + image preview in Bluesky
      const modalDialog = element.closest('[role="dialog"][aria-modal="true"]');
      if (modalDialog) {
        console.log('Found modal dialog container:', modalDialog);
        // Optional: Verify it also contains some form of image area, though usually the modal is correct
        const hasImageArea = modalDialog.querySelector('[data-testid*="image"], [role="img"], .r-1p0dtai');
        if (hasImageArea) {
           console.log('Modal dialog contains an image area, returning it.');
           return modalDialog;
        } else {
           console.warn('Modal dialog found, but no image area detected within it. Returning dialog anyway.');
           return modalDialog; // Still likely the best container
        }
      }
      
      // Priority 2: Look for a data-testid="composer" ancestor
      const testIdComposer = element.closest('[data-testid="composer"]');
      if (testIdComposer) {
        console.log('Found container via data-testid="composer":', testIdComposer);
        // Verify this container seems plausible (e.g., contains action buttons)
        if (testIdComposer.querySelector('button[aria-label*="Post"], button[type="submit"]')) {
           console.log('Composer with test ID seems valid.');
           return testIdComposer;
        }
         console.warn('Found data-testid="composer", but it lacks expected elements. Continuing search...');
      }
      
      // Priority 3: Fallback - Walk up looking for a plausible container with an image
      console.log('Modal or testid composer not found directly. Walking up DOM...');
      let current = element.parentElement;
      let maxDepth = 10;
      while (current && current.tagName !== 'BODY' && maxDepth > 0) {
          // Check if this level contains an image preview element
          const containsMediaPreview = !!current.querySelector('[data-testid*="image"] img, .r-1p0dtai img, [role="img"] img, video');
          // Check if it looks like a general container or card
          const isPlausibleContainer = current.matches('.css-175oi2r, [role="article"], [style*="flex-direction"]');
          
          if (containsMediaPreview && isPlausibleContainer) {
              console.log('Found plausible container with media preview by walking up:', current);
              return current; // Return the first plausible parent with media
          }
          maxDepth--;
          current = current.parentElement;
      }

      // Last Resort: Return a few levels up from the original element
      console.error('Could not reliably determine the composer container. Using fallback parent.');
      return element.parentElement?.parentElement?.parentElement || element.parentElement; 
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