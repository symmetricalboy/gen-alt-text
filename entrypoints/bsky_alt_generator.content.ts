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
    console.log('[Bluesky Alt Text] Content script starting...');

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

    // Connect to background script with improved error handling
    const connectToBackground = () => {
        // First check if extension context is valid
        if (!checkExtensionContext()) {
            console.log('Extension context is invalid - showing reload notification');
            showExtensionReloadNotification();
            return;
        }

        try {
            backgroundPort = browser.runtime.connect({ name: 'content-script-port' });
            console.log('Connected to background script successfully');
            
            backgroundPort.onMessage.addListener((message: any) => {
                handleBackgroundMessage(message);
            });

            backgroundPort.onDisconnect.addListener(() => {
                const runtimeError = browser.runtime.lastError;
                if (runtimeError) {
                    console.warn('Disconnected from background script with runtime error:', runtimeError.message);
                } else {
                    console.log('Disconnected from background script without a specific runtime error.');
                }
                backgroundPort = null;
                
                // Check if extension context is still valid before trying to reconnect
                if (!checkExtensionContext()) {
                    console.log('Extension context invalidated during disconnect - showing reload notification');
                    showExtensionReloadNotification();
                    return;
                }
                
                // Try to reconnect after a short delay
                setTimeout(() => {
                    if (extensionContextValid && checkExtensionContext()) {
                        console.log('Attempting to reconnect to background script...');
                        connectToBackground();
                    }
                }, 1000);
            });

            // Test the connection
            backgroundPort.postMessage({ type: 'ping' });
            
        } catch (error: any) {
            console.error('Failed to connect to background script:', error);
            backgroundPort = null;
            
            // Check if it's an extension context invalidation
            if (!checkExtensionContext() || (error.message && error.message.includes('Extension context invalidated'))) {
                console.error('Extension context invalidated - showing reload notification');
                showExtensionReloadNotification();
                return;
            }
            
            // For other errors, try again after a delay (but only if context is still valid)
            setTimeout(() => {
                if (extensionContextValid && checkExtensionContext()) {
                    console.log('Retrying connection to background script...');
                    connectToBackground();
                }
            }, 2000);
        }
    };

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
      
      // Check if we're in a Video settings dialog
      const isVideoSettingsDialog = container.getAttribute('aria-label') === 'Video settings' || 
                                   container.closest('[aria-label="Video settings"]');
      
      // For Video settings dialogs, we need to search more broadly since the video might not be in the same container
      let searchScope = container;
      if (isVideoSettingsDialog) {
        // Search in the entire document or at least a broader scope
        searchScope = document.body;
        console.log('[findMediaElement - V2] Video settings dialog detected, expanding search scope to document body');
      }
      
      const selectors: string[] = [
        '[data-testid="videoPreview"] video[src]', '[data-testid="videos"] video[src]',
        '[data-testid="videoPreview"] video source[src]', '[data-testid="videos"] video source[src]',
        'video[src]', 'video source[src]',
        '[data-testid="imagePreview"] img[src]:not([alt="AI"])', 
        '[data-testid="images"] img[src]:not([alt="AI"])',
        'img[src]:not([alt*="avatar" i]):not([src*="avatar"]):not([alt="AI"])'
      ];
      
      // For Video settings dialogs, also look for videos without src (might be in upload process)
      if (isVideoSettingsDialog) {
        selectors.unshift(
          'video:not([src])', 
          '[data-testid="videoPreview"] video',
          '[data-testid="videos"] video',
          'video' // Any video element
        );
      }
      
      const visibleElements: (HTMLImageElement | HTMLVideoElement)[] = [];
      for (const selector of selectors) {
        const elements = searchScope.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLSourceElement>(selector);
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
         mediaType = mediaElement.dataset.mimeType || sourceEl?.type || 'video/mp4'; // Default
         
         // If no explicit MIME type and we have a URL, try to infer from file extension
         if ((!mediaElement.dataset.mimeType && !sourceEl?.type) && src) {
           try {
             const url = new URL(src);
             const pathname = url.pathname.toLowerCase();
             if (pathname.endsWith('.webm')) {
               mediaType = 'video/webm';
             } else if (pathname.endsWith('.mp4')) {
               mediaType = 'video/mp4';
             } else if (pathname.endsWith('.avi')) {
               mediaType = 'video/avi';
             } else if (pathname.endsWith('.mov')) {
               mediaType = 'video/quicktime';
             } else if (pathname.endsWith('.ogv')) {
               mediaType = 'video/ogg';
             }
           } catch (e) {
             // Fallback to default if URL parsing fails
           }
         }
         
         // For video elements without src (during upload), create a placeholder that indicates this is for video upload
         if (!src && mediaElement instanceof HTMLVideoElement) {
           // Check if we're in a video settings dialog
           const isInVideoDialog = mediaElement.closest('[aria-label="Video settings"]');
           if (isInVideoDialog) {
             src = 'pending-upload://video-upload';
             mediaType = 'video/mp4'; // Default for pending uploads
             console.log('[getMediaSourceInfo] Video element without src detected in Video settings dialog, creating placeholder info');
           }
         }
      }
      if (!src) { createToast('Could not find media source.', 'error'); return null; }
      console.log('[getMediaSourceInfo] Media source URL:', src, 'Type:', mediaType);

      let fileName = 'pasted_media';
      try {
        if (src === 'pending-upload://video-upload') {
          fileName = `pending_video_upload_${Date.now()}`;
        } else {
          const urlObj = new URL(src);
          if (src.startsWith('blob:') || src.startsWith('data:')) {
              fileName = mediaElement.title || (mediaElement instanceof HTMLImageElement ? mediaElement.alt : null) || `media_${Date.now()}`;
          } else {
              fileName = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1) || fileName;
          }
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
    let extensionContextValid = true; // Track if extension context is still valid

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
      if (textarea.dataset.altGenButtonAdded === 'true') return;
      textarea.dataset.altGenButtonAdded = 'true';

      const container = findComposerContainer(textarea);
      if (!container) {
        console.log('[addGenerateButton] Could not find composer container for textarea:', textarea);
        return;
      }

      // Check if we're in a Video settings dialog specifically
      const isVideoSettingsDialog = container.getAttribute('aria-label') === 'Video settings' || 
                                   container.closest('[aria-label="Video settings"]');

      const mediaElement = findMediaElement(container);
      if (!mediaElement && !isVideoSettingsDialog) {
        console.log('[addGenerateButton] No media element found in container.');
        return;
      }

      // For Video settings dialog, we proceed even without a media element
      // since the video is being uploaded and not yet visible in the DOM

      const button = document.createElement('button');
      button.type = 'button';

      const icon = document.createElement('img');
      try {
        icon.src = browser.runtime.getURL('/icons/gen-alt-text-white.svg');
      } catch (e) { /* ignore */ }
      icon.alt = 'AI';
      icon.style.cssText = 'width: 16px; height: 16px; margin-right: 6px; vertical-align: text-bottom;';
      button.appendChild(icon);

      button.appendChild(document.createTextNode('Generate'));
      
      button.className = 'alt-text-gen-btn';
      button.style.cssText += `
        background-color: #208bfe;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        margin-left: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
        white-space: nowrap;
        position: relative;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Check extension context before proceeding
        if (!checkExtensionContext()) {
          showExtensionReloadNotification();
          return;
        }

        if (!backgroundPort) {
          createToast('Not connected to background service. Please refresh the page.', 'error', 8000);
          return;
        }

        try {
          setActiveButton(button);

          // Handle Video settings dialog case where there's no media element
          if (!mediaElement && isVideoSettingsDialog) {
            createToast('Please wait for the video upload to complete before generating alt text.', 'warning', 6000);
            resetActiveButton();
            return;
          }

          const mediaInfo = await getMediaSourceInfo(mediaElement!);
          if (!mediaInfo) {
            throw new Error('Could not get media source information');
          }

          const { srcUrl, mediaType, fileName } = mediaInfo;
          
          // Handle pending upload case
          if (srcUrl === 'pending-upload://video-upload') {
            createToast('Please wait for the video upload to complete before generating alt text.', 'warning', 6000);
            resetActiveButton();
            return;
          }
          
          console.log('[ContentScript] Processing media with URL:', srcUrl.substring(0, 50) + '...');
          
          console.log('[ContentScript] Sending media to background for processing:', { srcUrl: srcUrl.substring(0, 100) + '...', mediaType, fileName });

          const videoMetadata = mediaElement instanceof HTMLVideoElement ? getVideoMetadata(mediaElement) : null;

          const response = await browser.runtime.sendMessage({
            type: 'processLargeMediaViaSendMessage',
            payload: {
              mediaSrcUrl: srcUrl,
              fileName: fileName,
              mediaType: mediaType,
              generationType: 'altText',
              videoMetadata: videoMetadata
            }
          });

          if (response && response.error) {
            throw new Error(response.error);
          }

          console.log('[ContentScript] Successfully sent media to background script');

        } catch (error: any) {
          console.error('Error processing media:', error);
          
          // Check if it's an extension context error
          if (!checkExtensionContext() || error.message?.includes('Extension context invalidated')) {
            showExtensionReloadNotification();
            return;
          }
          
          createToast(error.message, 'error');
          resetActiveButton();
        }
      });

      textarea.parentElement?.appendChild(button);
      console.log('[addGenerateButton] Button added for textarea.');
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
        
        // Handle pending upload case
        if (sourceInfo.srcUrl === 'pending-upload://video-upload') {
            createToast('Please wait for the video upload to complete before generating captions.', 'warning', 6000);
            return;
        }

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
      
      // Initial check for any textareas already on the page
      document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);

      manualModeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;

          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;

              // 1. Look for alt text textareas being added
              if (element.matches(ALT_TEXT_SELECTOR)) {
                addGenerateButton(element as HTMLTextAreaElement);
              }
              element.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);

              // 2. Look for video elements to trigger a check for the caption button
              if (element.querySelector('video') || element.matches('video')) {
                 console.log('[MutationObserver] Video element detected. Checking for caption section soon.');
                 // The dialog for captions might take a moment to appear after the video.
                 setTimeout(addGenerateCaptionsButton, 500);
              }
            }
          }
        }
      });

      manualModeObserver.observe(document.body, { childList: true, subtree: true });
    };

    // Start observing immediately when content script loads
    observeAltTextAreas();

    // Handle messages from background script
    const handleBackgroundMessage = (message: any) => {
      try {
        console.log('[ContentScript] Received message from background:', message);
        
        if (message.type === 'progress') {
          createToast(message.message, 'info', 5000);
        } else if (message.type === 'ffmpegStatus') {
          createToast(`Video compression: ${message.status}`, message.error ? 'error' : 'info', message.error ? 8000 : 4000);
          
          if (message.firstLoadMessage && message.loading) {
            createToast(message.firstLoadMessage, 'persistent', 0);
          }
          
          if (message.error && message.status && message.status.includes('timed out')) {
            createToast('Note: Simple images and smaller videos can still be processed!', 'info', 6000);
          }
        } else if (message.type === 'warning') {
          createToast(message.message, 'warning', 7000);
        } else if (message.type === 'error') {
          createToast(`Error: ${message.message}`, 'error', 10000);
          resetActiveButton();
        } else if (message.type === 'altTextResult') {
          handleAltTextResult(message);
        } else if (message.type === 'captionResult') {
          handleCaptionResult(message);
        } else if (message.type === 'pong') {
          console.log('Received pong from background script - connection is healthy');
        } else {
          console.log('Received unhandled message type:', message.type);
        }
      } catch (error: any) {
        console.error('Error in handleBackgroundMessage:', error);
        if (error.message && error.message.includes('activeButton')) {
          console.warn('activeButton reference error - likely due to scope issue');
        }
      }
    };

    const findRelatedTextarea = (button: HTMLButtonElement): HTMLTextAreaElement | null => {
      const parent = button.parentElement;
      if (parent) {
        return parent.querySelector('textarea');
      }
      return null;
    };

    // Handle alt text result from background script
    const handleAltTextResult = (message: any) => {
        if (message.altText && activeButtonElement) {
            const textarea = findRelatedTextarea(activeButtonElement);
            if (textarea) {
                textarea.value = message.altText;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                createToast('Alt text generated successfully!', 'success', 3000);
            }
        }
        resetActiveButton();
    };

    // Handle caption result from background script  
    const handleCaptionResult = (message: any) => {
        if (message.vttResults && message.vttResults.length > 0) {
            const vttContent = message.vttResults[0].vttContent;
            if (vttContent && activeButtonElement) {
                const textarea = findRelatedTextarea(activeButtonElement);
                if (textarea) {
                    // Extract text content from VTT for use as alt text/captions
                    const textContent = extractTextFromVTT(vttContent);
                    textarea.value = textContent;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    createToast('Captions generated and converted to text!', 'success', 3000);
                }
            }
        }
        resetActiveButton();
    };

    // Extract readable text from VTT content
    const extractTextFromVTT = (vttContent: string): string => {
        const lines = vttContent.split('\n');
        const textLines: string[] = [];
        
        for (const line of lines) {
            // Skip VTT headers, timestamps, and empty lines
            if (line.includes('WEBVTT') || line.includes('-->') || line.trim() === '' || line.match(/^\d/)) {
                continue;
            }
            // Clean up any HTML tags and add to text
            const cleanLine = line.replace(/<[^>]*>/g, '').trim();
            if (cleanLine) {
                textLines.push(cleanLine);
            }
        }
        
        return textLines.join(' ');
    };

    // Check if extension context is still valid
    function checkExtensionContext(): boolean {
      try {
        return !!browser.runtime.id;
      } catch (error) {
        return false;
      }
    }

    // Show persistent notification about extension reload
    function showExtensionReloadNotification() {
      extensionContextValid = false;
      
      // Create a prominent, persistent notification
      const notification = document.createElement('div');
      notification.id = 'bsky-extension-reload-notice';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1d4ed8;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        max-width: 350px;
        border: 2px solid #3b82f6;
      `;
      
      notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 20px;">🔄</div>
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">Extension Updated</div>
            <div style="opacity: 0.9; font-size: 13px; margin-bottom: 8px;">
              Bluesky Alt Text Generator has been updated. Please refresh this page to continue using the extension.
            </div>
            <button id="refresh-page-btn" style="
              background: white; 
              color: #1d4ed8; 
              border: none; 
              padding: 6px 12px; 
              border-radius: 4px; 
              font-weight: 500; 
              cursor: pointer;
              font-size: 12px;
            ">Refresh Page</button>
          </div>
        </div>
      `;
      
      // Remove any existing notification
      const existing = document.getElementById('bsky-extension-reload-notice');
      if (existing) existing.remove();
      
      document.body.appendChild(notification);
      
      // Add click handler for refresh button
      const refreshBtn = notification.querySelector('#refresh-page-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          window.location.reload();
        });
      }
      
      // Auto-remove after 30 seconds and show a toast instead
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
          createToast('Extension updated - please refresh the page to restore functionality', 'persistent', 0);
        }
      }, 30000);
    }
  }
});
