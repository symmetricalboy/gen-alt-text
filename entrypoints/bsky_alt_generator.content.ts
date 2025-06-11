import { defineContentScript } from '#imports';

// Remove CS IndexedDB helpers as per new plan
// // --- IndexedDB Helper Functions (Content Script Side) ---
// const CS_DB_NAME = 'CS_MediaProcessingDB'; 
// const CS_STORE_NAME = 'CS_PendingFiles';
// const CS_DB_VERSION = 1;
// ... (csOpenDB, csStoreFileInDB functions removed) ...
// // --- End IndexedDB Helper Functions (Content Script Side) ---

export default defineContentScript({
  matches: ['*://*.bsky.app/*', '*://*.deer.social/*'],
  main() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log('[bsky_alt_generator] Not a browser environment, exiting main().');
      return;
    }

    console.log('Bluesky Alt Text Generator loaded - V2 with FFmpeg support (from defineContentScript)');
    
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
    const SINGLE_FILE_DIRECT_LIMIT = 19 * 1024 * 1024;
    const TOTAL_MEDIA_SIZE_LIMIT = 100 * 1024 * 1024;

    let backgroundPort: chrome.runtime.Port | null = null;
    const PORT_NAME = 'content-script-port';

    function connectToBackground() {
      if (backgroundPort && backgroundPort.sender) {
        try {
          backgroundPort.postMessage({ type: 'ping' });
          console.log('Background port still connected.');
          return;
        } catch (e) {
          console.log('Background port error on ping, reconnecting...', e);
          backgroundPort = null;
        }
      }

      console.log('Connecting to background script...');
      try {
        backgroundPort = browser.runtime.connect({ name: PORT_NAME });

        backgroundPort.onMessage.addListener((message: any) => {
          console.log('[ContentScript] Received message from background:', message);
          if (message.type === 'progress') {
            createToast(message.message, 'info', 5000);
          } else if (message.type === 'ffmpegStatus') {
            // Show the standard status message
            createToast(`FFmpeg: ${message.status}`, message.error ? 'error' : 'info', message.error ? 8000 : 4000);
            
            // If there's a first load message, show it as a persistent notification
            if (message.firstLoadMessage && message.loading) {
              createToast(message.firstLoadMessage, 'persistent', 0); // Persistent toast that won't auto-dismiss
            }
          } else if (message.type === 'warning') {
            createToast(message.message, 'warning', 7000);
          } else if (message.type === 'error') {
            createToast(`Error: ${message.message}`, 'error', 10000);
            resetActiveButton();
          }
        });

        backgroundPort.onDisconnect.addListener(() => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error('Disconnected from background script due to an error:', lastError.message);
          } else {
            console.error('Disconnected from background script without a specific runtime error.'); 
          }
          backgroundPort = null;
          createToast('Connection to background service lost. Please reload the extension or page.', 'error', 15000);
        });
      } catch (e) {
        console.error("Failed to connect to background script:", e);
        createToast('Could not connect to background service. Extension might not work.', 'error', 10000);
      }
    }

    connectToBackground();

    let manualModeObserver: MutationObserver | null = null;

    // Helper function to convert ArrayBuffer to Base64
    function arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function isEffectivelyVideo(mimeType: string | undefined | null): boolean {
      if (!mimeType) return false;
      return mimeType.startsWith('video/') ||
             mimeType === 'image/gif' ||
             mimeType === 'image/webp' ||
             mimeType === 'image/apng';
    }

    const createToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' | 'persistent' = 'info', duration: number = 8000) => {
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

      // Check if we already have a persistent toast with the same message
      if (type === 'persistent') {
        const existingToasts = Array.from(toastContainer.children) as HTMLElement[];
        for (const existingToast of existingToasts) {
          if (existingToast.getAttribute('data-persistent') === 'true' && 
              existingToast.textContent?.includes(message)) {
            return; // Don't create duplicate persistent messages
          }
        }
      }

      const toast = document.createElement('div');
      Object.assign(toast.style, {
        padding: '12px 16px', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        margin: '5px', minWidth: '250px', color: '#ffffff', fontSize: '14px',
        transition: 'all 0.3s ease', display: 'flex', justifyContent: 'space-between', 
        alignItems: 'center'
      });

      // Special formatting for persistent messages
      if (type === 'persistent') {
        Object.assign(toast.style, {
          backgroundColor: '#303f9f',
          borderLeft: '4px solid #ff9800',
          fontWeight: '500'
        });
        toast.setAttribute('data-persistent', 'true');
      } else {
        const colors = { success: '#208bfe', error: '#e53935', warning: '#f59f0b', info: '#007eda', persistent: '#303f9f' };
        toast.style.backgroundColor = colors[type] || colors.info;
      }

      const messageSpan = document.createElement('span');
      messageSpan.textContent = message;
      messageSpan.style.flex = '1';
      toast.appendChild(messageSpan);

      const closeBtn = document.createElement('span');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
        marginLeft: '8px', cursor: 'pointer', fontWeight: 'bold'
      });
      closeBtn.onclick = () => {
        if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
      };
      toast.appendChild(closeBtn);

      toastContainer.appendChild(toast);
      
      // Auto-dismiss if not persistent
      if (type !== 'persistent' && duration > 0) {
        setTimeout(() => {
          if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
        }, duration);
      }
    };

    const findMediaElement = (container: Element): HTMLImageElement | HTMLVideoElement | null => {
      console.log('[findMediaElement - V2] Searching for media in container:', container);
      const isElementVisible = (el: Element | null): el is HTMLElement => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null;
      };
      const selectors: string[] = [
        '[data-testid="videoPreview"] video[src]', '[data-testid="videos"] video[src]',
        '[data-testid="videoPreview"] video source[src]', '[data-testid="videos"] video source[src]',
        'video[src]', 'video source[src]',
        '[data-testid="imagePreview"] img[src]:not([alt="AI"])', 
        '[data-testid="images"] img[src]:not([alt="AI"])',
        'img[src]:not([alt*="avatar" i]):not([src*="avatar"]):not([alt="AI"])'
      ];
      const visibleElements: (HTMLImageElement | HTMLVideoElement)[] = [];
      for (const selector of selectors) {
        const elements = container.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLSourceElement>(selector);
        elements.forEach(element => {
          if (element instanceof HTMLSourceElement) {
            const videoParent = element.closest('video');
            if (videoParent && isElementVisible(videoParent) && !visibleElements.includes(videoParent)) {
              visibleElements.push(videoParent);
            }
          } else if (element && isElementVisible(element) && !visibleElements.includes(element as (HTMLImageElement | HTMLVideoElement))) {
            if (element instanceof HTMLImageElement && element.closest(`#${BUTTON_ID}`)) {
                // Skip if it's an image inside our button
            } else {
                visibleElements.push(element as (HTMLImageElement | HTMLVideoElement));
            }
          }
        });
      }
      if (visibleElements.length > 0) {
        const videoElements = visibleElements.filter(el => el instanceof HTMLVideoElement);
        if (videoElements.length > 0) return videoElements[videoElements.length - 1];
        return visibleElements[visibleElements.length - 1];
      }
      console.warn('[findMediaElement - V2] No suitable media element found in container:', container);
      return null;
    };

    const findComposerContainer = (element: Element): HTMLElement | null => {
      const potentialContainers = [
        element.closest<HTMLElement>('[data-testid="composePostView"]'),
        element.closest<HTMLElement>('[role="dialog"][aria-label*="alt text" i]'),
        element.closest<HTMLElement>('[aria-label="Video settings"]'),
      ];
      for (const container of potentialContainers) {
        if (container) return container;
      }
      return null;
    };

    const getMediaSourceInfo = async (mediaElement: HTMLImageElement | HTMLVideoElement): Promise<{ srcUrl: string; mediaType: string; fileName: string; fileSize?: number } | null> => {
      let src = '';
      let mediaType = '';

      if (mediaElement instanceof HTMLImageElement) {
         src = mediaElement.currentSrc || mediaElement.src;
         if (src.startsWith('data:')) {
            mediaType = src.substring(src.indexOf(':') + 1, src.indexOf(';'));
         } else {
            mediaType = 'image/jpeg'; // Placeholder, refine if necessary based on actual image types or src extension
         }
      } else if (mediaElement instanceof HTMLVideoElement) {
         const sourceEl = mediaElement.querySelector('source');
         src = sourceEl?.src || mediaElement.src;
         mediaType = mediaElement.dataset.mimeType || sourceEl?.type || 'video/mp4'; // Removed mediaElement.type
      }
      if (!src) { createToast('Could not find media source.', 'error'); return null; }
      console.log('[getMediaSourceInfo] Media source URL:', src, 'Type:', mediaType);

      let fileName = 'pasted_media';
      try {
        const urlObj = new URL(src);
        if (src.startsWith('blob:') || src.startsWith('data:')) {
            fileName = mediaElement.title || (mediaElement instanceof HTMLImageElement ? mediaElement.alt : null) || `media_${Date.now()}`;
        } else {
            fileName = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1) || fileName;
        }
      } catch (e) {
        fileName = mediaElement.title || (mediaElement instanceof HTMLImageElement ? mediaElement.alt : null) || `media_${Date.now()}`;
        console.warn('[getMediaSourceInfo] Could not parse src as standard URL for filename, generated name:', fileName, e);
      }
      
      // Attempt to get a file extension from the fileName if it doesn't have one
      if (!fileName.includes('.') && mediaType) {
          const probableExtension = mediaType.split('/')[1];
          if (probableExtension) fileName += '.' + probableExtension;
      } else if (!fileName.includes('.')) {
          fileName += '.bin'; // fallback extension
      }
      console.log('[getMediaSourceInfo] Determined fileName:', fileName);

      // We won't fetch the blob here to get its size to avoid premature data loading
      // The size will be determined by the component that eventually fetches the URL (e.g., offscreen document)
      return { srcUrl: src, mediaType: mediaType, fileName };
    };

    let activeButtonElement: HTMLButtonElement | null = null;
    let originalButtonText: string = '';

    function setActiveButton(button: HTMLButtonElement, text: string = "Generating..."){
      if (activeButtonElement) resetButtonText(activeButtonElement, originalButtonText);
      activeButtonElement = button;
      originalButtonText = button.innerHTML;
      button.innerHTML = `<span class="loading-spinner"></span> ${text}`;
      button.disabled = true;
      if (!document.getElementById('gemini-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'gemini-spinner-style';
        style.textContent = `.loading-spinner { width: 1em; height: 1em; margin-right: 8px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s ease-in-out infinite; display: inline-block; } @keyframes spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
      }
    }

    function resetButtonText(button: HTMLButtonElement | null = activeButtonElement, text: string = originalButtonText) {
      if (button) {
        button.innerHTML = text;
        button.disabled = false;
      }
      if (button === activeButtonElement) {
        activeButtonElement = null;
        originalButtonText = '';
      }
    }
    
    function resetActiveButton() {
      if (activeButtonElement) {
        resetButtonText(activeButtonElement, originalButtonText);
      }
    }

    function getVideoMetadata(mediaElement: HTMLVideoElement): any {
      if (!(mediaElement instanceof HTMLVideoElement)) return {};
      return { duration: mediaElement.duration, width: mediaElement.videoWidth, height: mediaElement.videoHeight };
    }

    function addGenerateButton(textarea: HTMLTextAreaElement) {
      console.log('[bsky_alt_generator] addGenerateButton CALLED for textarea:', textarea);

      const buttonAttachPoint = textarea.parentElement;
      if (!buttonAttachPoint) {
        console.log('[bsky_alt_generator] addGenerateButton: No buttonAttachPoint (parentElement is null). Skipping for textarea:', textarea);
        return;
      }
      console.log('[bsky_alt_generator] addGenerateButton: textarea.parentElement is:', buttonAttachPoint);

      const existingButtonById = buttonAttachPoint.querySelector(`#${BUTTON_ID}`);
      console.log('[bsky_alt_generator] addGenerateButton: Result of buttonAttachPoint.querySelector(#BUTTON_ID) before checks:', existingButtonById);

      // Check if a button with this ID already exists in the attach point FIRST
      if (existingButtonById) {
         console.log('[bsky_alt_generator] addGenerateButton: Button with ID already exists in attach point (checked by querySelector). Ensuring textarea is marked and skipping.:', textarea);
         textarea.dataset.geminiButtonAdded = 'true'; // Ensure it's marked if button found
         return;
      }

      // Then, check the dataset attribute.
      const datasetValue = textarea.dataset.geminiButtonAdded;
      console.log(`[bsky_alt_generator] addGenerateButton: Value of textarea.dataset.geminiButtonAdded before check: '${datasetValue}', type: ${typeof datasetValue}`);
      if (datasetValue === 'true') {
        console.log('[bsky_alt_generator] addGenerateButton: Textarea already marked with geminiButtonAdded=\'true\', but no button found by ID. Skipping to avoid conflict/duplicates.:', textarea);
        return;
      }

      const contextContainer = findComposerContainer(textarea);
      if (!contextContainer) {
        console.log('[bsky_alt_generator] addGenerateButton: No contextContainer found. Skipping for textarea:', textarea);
        return;
      }
      console.log('[bsky_alt_generator] addGenerateButton: Found contextContainer:', contextContainer, 'for textarea:', textarea);
      
      let mediaSearchContainer: Element | null = contextContainer;
      if (contextContainer.matches('[aria-label="Video settings"]')) {
          mediaSearchContainer = document.querySelector('[data-testid="composePostView"]');
          if (!mediaSearchContainer) {
            console.log('[bsky_alt_generator] addGenerateButton: mediaSearchContainer (composePostView) not found for video settings context. Skipping for textarea:', textarea);
            return; // Added return if mediaSearchContainer not found in this specific case
          }
      }
      
      console.log('[bsky_alt_generator] addGenerateButton: All checks passed, proceeding to create and add button for textarea:', textarea);
      
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text';
      const icon = document.createElement('img');
      try { icon.src = browser.runtime.getURL('/icons/gen-alt-text-white.svg'); } catch (e) { /* ignore */ }
      icon.alt = 'AI';
      Object.assign(icon.style, { width: '16px', height: '16px', marginRight: '6px' });
      button.appendChild(icon);
      button.appendChild(document.createTextNode('Generate Alt Text'));
      Object.assign(button.style, {
        marginLeft: '8px', padding: '8px 16px', cursor: 'pointer', border: 'none',
        borderRadius: '8px', backgroundColor: '#208bfe', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '14px',
        fontWeight: 'bold', color: 'white',
        zIndex: '9999' // Added z-index just in case
      });

      const originalButtonTextContentForThisButton = button.innerHTML;

      button.onclick = async () => {
        if (!backgroundPort) {
          createToast('Not connected. Reconnecting...', 'error');
          connectToBackground();
          if(!backgroundPort) { createToast('Reconnect failed.', 'error'); return; }
        }
        const composer = findComposerContainer(textarea);
        if (!composer) { createToast('Could not find context.', 'error'); return; }
        const mediaElement = findMediaElement(mediaSearchContainer || composer);
        if (!mediaElement) { createToast('No media found.', 'error'); return; }
        
        const sourceInfo = await getMediaSourceInfo(mediaElement);
        if (!sourceInfo) return;

        setActiveButton(button, 'AI Alt Text...');

        let videoMeta = {};
        if (mediaElement instanceof HTMLVideoElement) videoMeta = getVideoMetadata(mediaElement);

        try {
          // We no longer convert to ArrayBuffer or Base64 here.
          // We send the URL to the background script.
          console.log('[ContentScript] Sending media source URL for Alt Text:', sourceInfo.srcUrl);

          new Promise<string>((resolve, reject) => {
            const specificHandler = (message: any) => {
              // Ensure message matching based on a unique identifier if possible, e.g. srcUrl if it's unique enough for this context
              if (message.originalSrcUrl === sourceInfo.srcUrl && (message.type === 'altTextResult' || message.type === 'error')) {
                if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
                resetButtonText(button, originalButtonTextContentForThisButton);
                if (message.error) reject(new Error(message.error));
                else if (message.altText !== undefined) resolve(message.altText);
                else reject(new Error('Invalid alt text response.'));
              }
            };
            if (backgroundPort) backgroundPort.onMessage.addListener(specificHandler);
            else { 
              resetButtonText(button, originalButtonTextContentForThisButton);
              reject(new Error('Background port not connected.')); 
              return; 
            }

            const payloadForSendMessage = {
                mediaSrcUrl: sourceInfo.srcUrl,
                fileName: sourceInfo.fileName,
                mediaType: sourceInfo.mediaType,
                // size will be determined by background/offscreen when it fetches the URL
                generationType: 'altText',
                videoMetadata: videoMeta
            };
            
            // Use browser.runtime.sendMessage for initial data transfer
            browser.runtime.sendMessage({
                type: 'processLargeMediaViaSendMessage', // New message type for sendMessage
                payload: payloadForSendMessage
            }).then(response => {
                if (response && response.error) {
                    console.error('[ContentScript] Error response from background after sendMessage:', response.error);
                    reject(new Error(response.error));
                    resetButtonText(button, originalButtonTextContentForThisButton);
                } else if (response && response.success) {
                    console.log('[ContentScript] Background acknowledged receipt via sendMessage for alt text.');
                    // Now we wait for altTextResult via the port
                } else {
                    // This case might indicate an issue if no specific response format is defined
                    console.warn('[ContentScript] Unexpected response from background after sendMessage for alt text:', response);
                }
            }).catch(err => {
                console.error('[ContentScript] Error sending message to background:', err);
                reject(err);
                resetButtonText(button, originalButtonTextContentForThisButton);
            });

            // Keep listening on the port for the actual result
            if (backgroundPort) backgroundPort.onMessage.addListener(specificHandler);
            else { 
              resetButtonText(button, originalButtonTextContentForThisButton);
              reject(new Error('Background port not connected for result listening.')); 
              return; 
            }
            
            // Timeout for the overall operation (waiting for port message)
            setTimeout(() => {
                if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
                if (activeButtonElement === button && button) { // Check if this button is still the active one
                    resetButtonText(button, originalButtonTextContentForThisButton);
                }
                reject(new Error('Alt text generation timed out.'));
            }, 360000); // Increased timeout for alt text generation
          })
          .then(altText => {
            textarea.value = altText;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            createToast('Alt text generated!', 'success');
          })
          .catch(error => {
            console.error('Error generating alt text:', error);
            if (activeButtonElement === button) {
               resetButtonText(button, originalButtonTextContentForThisButton);
            }
            createToast(error.message || 'Unknown error generating alt text', 'error');
          });
        } catch (error) {
            console.error('[ContentScript] Error converting file to ArrayBuffer or sending for alt text:', error);
            createToast('Error preparing file for processing.', 'error');
            resetButtonText(button, originalButtonTextContentForThisButton);
        }
      };
      buttonAttachPoint.appendChild(button);
      textarea.dataset.geminiButtonAdded = 'true';
      console.log('[bsky_alt_generator] addGenerateButton: SUCCESSFULLY ADDED button for textarea:', textarea);
      console.log('[bsky_alt_generator] addGenerateButton: Button appended. button.isConnected:', button.isConnected, 'button.offsetParent:', button.offsetParent);
      // Check if it can be found immediately after adding
      const buttonFoundAfterAdd = buttonAttachPoint.querySelector(`#${BUTTON_ID}`);
      console.log('[bsky_alt_generator] addGenerateButton: Result of buttonAttachPoint.querySelector(#BUTTON_ID) immediately after add:', buttonFoundAfterAdd);
    }

    const findCaptionSection = (): HTMLElement | null => {
        console.log('[findCaptionSection] Attempting to find caption section...');
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        console.log(`[findCaptionSection] Found ${dialogs.length} dialogs.`);
        for (const dialog of dialogs) {
            const label = dialog.getAttribute('aria-label');
            console.log('[findCaptionSection] Checking dialog with label:', label, dialog);
            if (label && (label.includes('Video') || label.includes('video') || label.includes('Media'))) {
                console.log('[findCaptionSection] Dialog label matched for Video/Media. Searching for caption headers...');
                const captionHeaders = Array.from(dialog.querySelectorAll('div, span, label, p, h1, h2, h3'))
                    .filter(el => el.textContent?.toLowerCase().includes('caption') || el.textContent?.toLowerCase().includes('.vtt'));
                console.log(`[findCaptionSection] Found ${captionHeaders.length} potential caption headers.`);
                if (captionHeaders.length > 0) {
                    let captionSectionElement: HTMLElement = captionHeaders[0] as HTMLElement;
                    console.log('[findCaptionSection] Initial caption header element:', captionSectionElement);
                    for (let i = 0; i < 5; i++) { // Try to find a suitable parent container
                        if (captionSectionElement.querySelector('input[type="file"], button, [role="button"]')) {
                            console.log('[findCaptionSection] Found suitable caption section with input/button:', captionSectionElement);
                            return captionSectionElement;
                        }
                        if (!captionSectionElement.parentElement) {
                            console.log('[findCaptionSection] Caption header has no parentElement, breaking search upwards.');
                            break;
                        }
                        captionSectionElement = captionSectionElement.parentElement;
                        console.log('[findCaptionSection] Moved to parent element:', captionSectionElement);
                    }
                    // Fallback to the first header if no better container found by traversing up
                    console.log('[findCaptionSection] Could not find ideal parent, falling back to first caption header\'s parent or itself:', captionHeaders[0].parentElement || captionHeaders[0]);
                    return captionHeaders[0].parentElement || captionHeaders[0] as HTMLElement;
                }
            }
        }
        console.log('[findCaptionSection] No suitable caption section found after checking all dialogs.');
        return null;
    };

    const addGenerateCaptionsButton = () => {
      console.log('[addGenerateCaptionsButton] Attempting to add button...');
      const captionSection = findCaptionSection();
      if (!captionSection) {
        console.log('[addGenerateCaptionsButton] No captionSection found. Button not added.');
        return;
      }
      if (captionSection.querySelector(`#${CAPTION_BUTTON_ID}`)) {
        console.log('[addGenerateCaptionsButton] Caption button already exists. Skipping.');
        return;
      }
      console.log('[addGenerateCaptionsButton] Found captionSection:', captionSection, 'Proceeding to add button.');

      let buttonContainer: HTMLElement | null = captionSection.querySelector('div[style*="flex-direction: row"]');
      if (!buttonContainer) {
          const potentialContainers = Array.from(captionSection.querySelectorAll('div')).filter(el => el.querySelector('button, input[type="file"]'));
          if (potentialContainers.length > 0) buttonContainer = potentialContainers[0] as HTMLElement;
      }
      if (!buttonContainer) {
          buttonContainer = document.createElement('div');
          Object.assign(buttonContainer.style, { display:'flex', flexDirection: 'row', gap: '10px', marginTop: '10px' });
          captionSection.appendChild(buttonContainer);
      } else {
          Object.assign(buttonContainer.style, { display:'flex', flexDirection: 'row', gap: '10px' });
      }

      const button = document.createElement('button');
      button.id = CAPTION_BUTTON_ID;
      const icon = document.createElement('img');
      try { icon.src = browser.runtime.getURL('/icons/gen-alt-text-white.svg'); } catch(e) { /* ignore */ }
      icon.alt = 'AI';
      Object.assign(icon.style, { width: '16px', height: '16px', marginRight: '6px' });
      button.appendChild(icon);
      button.appendChild(document.createTextNode('Generate Captions'));
      const existingButton = captionSection.querySelector('button, [role="button"]');
      if (existingButton) {
          button.className = existingButton.className;
          const computedStyle = window.getComputedStyle(existingButton);
          Object.assign(button.style, { backgroundColor: '#208bfe', color: 'white', fontWeight: 'bold', marginLeft: '10px', padding: computedStyle.padding, borderRadius: computedStyle.borderRadius, border: computedStyle.border, cursor: 'pointer' });
      } else {
          Object.assign(button.style, { backgroundColor: '#208bfe', color: 'white', fontWeight: 'bold', padding: '13px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginLeft: '10px' });
      }
      button.onclick = generateCaptions;
      
      const subtitleButton = captionSection.querySelector('button[aria-label*="subtitle" i]') as HTMLElement;
      if (subtitleButton?.parentElement) subtitleButton.insertAdjacentElement('afterend', button);
      else buttonContainer.appendChild(button);
      console.log('[addGenerateCaptionsButton] Added generate captions button.');
    };

    const generateCaptions = async () => {
        createToast('Caption generation initiated.', 'info');
        const container = document.querySelector('[data-testid="composePostView"]') || document.body;
        const videoElement = findMediaElement(container);
        if (!videoElement || !(videoElement instanceof HTMLVideoElement)) {
            createToast('No video found for captions.', 'error'); return;
        }
        const sourceInfo = await getMediaSourceInfo(videoElement);
        if (!sourceInfo) { createToast('Could not get video file info.', 'error'); return; }

        const button = document.getElementById(CAPTION_BUTTON_ID) as HTMLButtonElement | null;
        const originalButtonTextContentForThisButton = button ? button.innerHTML : "Generate Captions"; // Store original text before setting active
        if(button) setActiveButton(button, 'AI Captions...');

        if (!backgroundPort) {
            createToast('Background connection error.', 'error');
            if(button) resetButtonText(button, originalButtonTextContentForThisButton);
            return;
        }
        
        try {
            console.log('[ContentScript] Sending media source URL for Captions:', sourceInfo.srcUrl);
            const videoMeta = getVideoMetadata(videoElement);

            new Promise<Array<{fileName: string, vttContent: string}>>((resolve, reject) => {
                const specificHandler = (message: any) => {
                    if (message.originalSrcUrl === sourceInfo.srcUrl && (message.type === 'captionResult' || message.type === 'error')) {
                        if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
                        if(button) resetButtonText(button, originalButtonTextContentForThisButton);
                        if (message.error) reject(new Error(message.error));
                        else if (message.vttResults) resolve(message.vttResults);
                        else reject(new Error('Invalid caption response.'));
                    }
                };
                if (backgroundPort) backgroundPort.onMessage.addListener(specificHandler);
                else { 
                  if(button) resetButtonText(button, originalButtonTextContentForThisButton);
                  reject(new Error('Background port not connected.')); 
                  return; 
                }

                const payloadForSendMessage = {
                    mediaSrcUrl: sourceInfo.srcUrl,
                    fileName: sourceInfo.fileName,
                    mediaType: sourceInfo.mediaType,
                    // size will be determined by background/offscreen
                    generationType: 'captions',
                    videoMetadata: videoMeta
                };

                // Use browser.runtime.sendMessage for initial data transfer
                browser.runtime.sendMessage({
                    type: 'processLargeMediaViaSendMessage', // New message type
                    payload: payloadForSendMessage
                }).then(response => {
                    if (response && response.error) {
                        console.error('[ContentScript] Error response from background after sendMessage:', response.error);
                        reject(new Error(response.error));
                        if(button) resetButtonText(button, originalButtonTextContentForThisButton);
                    } else if (response && response.success) {
                        console.log('[ContentScript] Background acknowledged receipt via sendMessage for captions.');
                        // Now we wait for captionResult via the port
                    } else {
                        console.warn('[ContentScript] Unexpected response from background after sendMessage for captions:', response);
                    }
                }).catch(err => {
                    console.error('[ContentScript] Error sending message to background for captions:', err);
                    reject(err);
                    if(button) resetButtonText(button, originalButtonTextContentForThisButton);
                });

                // Keep listening on the port for the actual result
                if (backgroundPort) backgroundPort.onMessage.addListener(specificHandler);
                else { 
                  if(button) resetButtonText(button, originalButtonTextContentForThisButton);
                  reject(new Error('Background port not connected for caption result listening.')); 
                  return; 
                }

                // Timeout for the overall operation (waiting for port message)
                setTimeout(() => {
                    if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
                    if (activeButtonElement === button && button) { // Check if this button is still the active one
                        resetButtonText(button, originalButtonTextContentForThisButton);
                    }
                    reject(new Error('Caption generation timed out.'));
                }, 360000); // Increased timeout for caption generation
            })
            .then(vttResults => {
                if (vttResults && vttResults.length > 0) {
                    vttResults.forEach(result => downloadVTTFile(result.vttContent, result.fileName));
                    createToast('Captions generated and downloaded!', 'success');
                     const fileInput = document.querySelector('input[type="file"][accept=".vtt"]');
                    if (fileInput) createToast('Please select the downloaded .vtt file(s).', 'info', 6000);
                } else {
                     createToast('No caption data returned.', 'warning');
                }
            })
            .catch(error => {
                console.error('Error generating captions:', error);
                createToast(error.message, 'error');
                if(button) resetButtonText(button, originalButtonTextContentForThisButton);
            });
        } catch (error) {
            console.error('[ContentScript] Error converting file to ArrayBuffer or sending for captions:', error);
            createToast('Error preparing file for caption processing.', 'error');
            if(button) resetButtonText(button, originalButtonTextContentForThisButton);
        }
    };
    
    const downloadVTTFile = (vttContent: string, filename: string = `captions-${Date.now()}.vtt`) => {
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    };

    const observeAltTextAreas = () => {
      if (manualModeObserver) manualModeObserver.disconnect();
      console.log('[observeAltTextAreas] Starting observer...');
      const existingTextareas = document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR);
      console.log(`[observeAltTextAreas] Found ${existingTextareas.length} existing textareas with selector: ${ALT_TEXT_SELECTOR}`);
      existingTextareas.forEach(addGenerateButton);
      
      addGenerateCaptionsButton();
      setTimeout(addGenerateCaptionsButton, 500);
      setTimeout(addGenerateCaptionsButton, 2000);

      manualModeObserver = new MutationObserver((mutations) => {
        let shouldCheckForCaptions = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node instanceof HTMLElement) {
                // Check for new dialogs that might contain caption sections
                if (node.matches('div[role="dialog"]') || node.querySelector('div[role="dialog"]')) {
                  console.log('[MutationObserver] Dialog added or content changed, re-checking for caption button.');
                  shouldCheckForCaptions = true;
                }

                if (node.matches(ALT_TEXT_SELECTOR)) {
                  console.log('[MutationObserver] Matched ALT_TEXT_SELECTOR on added node:', node);
                  addGenerateButton(node as HTMLTextAreaElement);
                }
                const childTextareas = node.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR);
                if (childTextareas.length > 0) {
                  console.log(`[MutationObserver] Found ${childTextareas.length} child textareas with selector: ${ALT_TEXT_SELECTOR}`);
                  childTextareas.forEach(addGenerateButton);
                }
              }
            });
          }
          // Also consider if the mutation itself might be relevant to caption sections,
          // e.g. attributes changing on a dialog.
          if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && mutation.target.matches('div[role="dialog"]')) {
            console.log('[MutationObserver] Attributes changed on a dialog, re-checking for caption button.');
            shouldCheckForCaptions = true;
          }
        }
        if (shouldCheckForCaptions) {
          addGenerateCaptionsButton();
        }
      });

      manualModeObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'aria-label', 'class'] });
    };

    observeAltTextAreas();
  }
});
