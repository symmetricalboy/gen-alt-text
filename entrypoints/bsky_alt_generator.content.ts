import iconUrl from '/icons/gen-alt-text-white.svg';
import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: ['*://*.bsky.app/*'],
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
            createToast(`FFmpeg: ${message.status}`, message.error ? 'error' : 'info', message.error ? 8000 : 4000);
          } else if (message.type === 'warning') {
            createToast(message.message, 'warning', 7000);
          } else if (message.type === 'error') {
            createToast(`Error: ${message.message}`, 'error', 10000);
            resetActiveButton();
          }
        });

        backgroundPort.onDisconnect.addListener(() => {
          console.error('Disconnected from background script!', backgroundPort?.error);
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

    function isEffectivelyVideo(mimeType: string | undefined | null): boolean {
      if (!mimeType) return false;
      return mimeType.startsWith('video/') ||
             mimeType === 'image/gif' ||
             mimeType === 'image/webp' ||
             mimeType === 'image/apng';
    }

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
        '[data-testid="imagePreview"] img[src]', '[data-testid="images"] img[src]',
        'img[src]:not([alt*="avatar" i]):not([src*="avatar"])'
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
            visibleElements.push(element as (HTMLImageElement | HTMLVideoElement));
          }
        });
      }
      if (visibleElements.length > 0) {
        const videoElements = visibleElements.filter(el => el instanceof HTMLVideoElement);
        if (videoElements.length > 0) return videoElements[videoElements.length - 1];
        return visibleElements[visibleElements.length - 1];
      }
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

    const getMediaFileObject = async (mediaElement: HTMLImageElement | HTMLVideoElement): Promise<File | null> => {
      let src = '';
      if (mediaElement instanceof HTMLImageElement) {
         src = mediaElement.currentSrc || mediaElement.src;
      } else if (mediaElement instanceof HTMLVideoElement) {
         const sourceEl = mediaElement.querySelector('source');
         src = sourceEl?.src || mediaElement.src;
      }
      if (!src) { createToast('Could not find media source.', 'error'); return null; }

      let fileName = 'pasted_media';
      try {
        const urlObj = new URL(src);
        fileName = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1) || fileName;
      } catch (e) { /* Not a valid URL */ }
      if (!fileName.includes('.') && mediaElement.dataset.mimeType) {
          fileName += '.' + mediaElement.dataset.mimeType.split('/')[1] || 'bin';
      }

      try {
        const response = await fetch(src);
        const blob = await response.blob();
        if (blob.size > TOTAL_MEDIA_SIZE_LIMIT) {
          createToast(`File is too large (${(blob.size / (1024*1024)).toFixed(1)}MB). Max ${TOTAL_MEDIA_SIZE_LIMIT/(1024*1024)}MB.`, 'error');
          return null;
        }
        const nameFromType = blob.type.replace('/', '.');
        const finalFileName = src.startsWith('data:') ? `data_url_media.${nameFromType}` : (fileName || `blob_media.${nameFromType}`);
        return new File([blob], finalFileName, {type: blob.type});
      } catch (e) {
        console.error('[getMediaFileObject] Error processing media source:', src, e);
        createToast('Error processing media data.', 'error');
        return null;
      }
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
      if (textarea.dataset.geminiButtonAdded === 'true') return;
      const contextContainer = findComposerContainer(textarea);
      if (!contextContainer) return;
      
      let mediaSearchContainer: Element | null = contextContainer;
      if (contextContainer.matches('[aria-label="Video settings"]')) {
          mediaSearchContainer = document.querySelector('[data-testid="composePostView"]');
          if (!mediaSearchContainer) return;
      }
      
      const buttonAttachPoint = textarea.parentElement;
      if (!buttonAttachPoint || buttonAttachPoint.querySelector(`#${BUTTON_ID}`)) {
         if(buttonAttachPoint) textarea.dataset.geminiButtonAdded = 'true'; 
         return;
      }
      
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text';
      const icon = document.createElement('img');
      try { icon.src = browser.runtime.getURL(iconUrl); } catch (e) { /* ignore */ }
      icon.alt = 'AI';
      Object.assign(icon.style, { width: '16px', height: '16px', marginRight: '6px' });
      button.appendChild(icon);
      button.appendChild(document.createTextNode('Generate Alt Text'));
      Object.assign(button.style, {
        marginLeft: '8px', padding: '8px 16px', cursor: 'pointer', border: 'none',
        borderRadius: '8px', backgroundColor: '#208bfe', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '14px',
        fontWeight: 'bold', color: 'white'
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
        const mediaFile = await getMediaFileObject(mediaElement);
        if (!mediaFile) return;

        setActiveButton(button, 'AI Alt Text...');

        let videoMeta = {};
        if (mediaElement instanceof HTMLVideoElement) videoMeta = getVideoMetadata(mediaElement);

        new Promise<string>((resolve, reject) => {
          const specificHandler = (message: any) => {
            if (message.originalFileName === mediaFile.name && (message.type === 'altTextResult' || message.type === 'error')) {
              if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
              resetButtonText(button, originalButtonTextContentForThisButton);
              if (message.error) reject(new Error(message.error));
              else if (message.altText !== undefined) resolve(message.altText);
              else reject(new Error('Invalid alt text response.'));
            }
          };
          if (backgroundPort) backgroundPort.onMessage.addListener(specificHandler);
          else { reject(new Error('Background port not connected.')); return; }

          backgroundPort.postMessage({
            type: 'processLargeMedia',
            payload: { file: mediaFile, generationType: 'altText', videoMetadata: videoMeta }
          });
          setTimeout(() => {
            if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
            reject(new Error('Alt text generation timed out.'));
          }, 360000);
        })
        .then(altText => {
          textarea.value = altText;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          createToast('Alt text generated!', 'success');
        })
        .catch(error => {
          console.error('Error generating alt text:', error);
          createToast(error.message, 'error');
          resetButtonText(button, originalButtonTextContentForThisButton);
        });
      };
      buttonAttachPoint.appendChild(button);
      textarea.dataset.geminiButtonAdded = 'true';
    }

    const findCaptionSection = (): HTMLElement | null => {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        for (const dialog of dialogs) {
            const label = dialog.getAttribute('aria-label');
            if (label && (label.includes('Video') || label.includes('video') || label.includes('Media'))) {
                const captionHeaders = Array.from(dialog.querySelectorAll('div, span, label, p, h1, h2, h3'))
                    .filter(el => el.textContent?.toLowerCase().includes('caption') || el.textContent?.toLowerCase().includes('.vtt'));
                if (captionHeaders.length > 0) {
                    let captionSection: HTMLElement = captionHeaders[0] as HTMLElement;
                    for (let i = 0; i < 5; i++) {
                        if (captionSection.querySelector('input[type="file"], button, [role="button"]')) return captionSection;
                        if (!captionSection.parentElement) break;
                        captionSection = captionSection.parentElement;
                    }
                    return captionHeaders[0] as HTMLElement;
                }
            }
        }
        return null;
    };

    const addGenerateCaptionsButton = () => {
      const captionSection = findCaptionSection();
      if (!captionSection || captionSection.querySelector(`#${CAPTION_BUTTON_ID}`)) return;

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
      try { icon.src = browser.runtime.getURL(iconUrl); } catch(e) { /* ignore */ }
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
        createToast('Caption generation initiated (stub).', 'info');
        const container = document.querySelector('[data-testid="composePostView"]') || document.body;
        const videoElement = findMediaElement(container);
        if (!videoElement || !(videoElement instanceof HTMLVideoElement)) {
            createToast('No video found for captions.', 'error'); return;
        }
        const mediaFile = await getMediaFileObject(videoElement);
        if (!mediaFile) { createToast('Could not get video file.', 'error'); return; }

        const button = document.getElementById(CAPTION_BUTTON_ID) as HTMLButtonElement | null;
        if(button) setActiveButton(button, 'AI Captions...');
        const originalButtonTextContentForThisButton = button ? button.innerHTML : "Generate Captions";

        if (!backgroundPort) {
            createToast('Background connection error.', 'error');
            if(button) resetButtonText(button, originalButtonTextContentForThisButton);
            return;
        }
        
        new Promise<Array<{fileName: string, vttContent: string}>>((resolve, reject) => {
            const specificHandler = (message: any) => {
                if (message.originalFileName === mediaFile.name && (message.type === 'captionResult' || message.type === 'error')) {
                    if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
                    if(button) resetButtonText(button, originalButtonTextContentForThisButton);
                    if (message.error) reject(new Error(message.error));
                    else if (message.vttResults) resolve(message.vttResults);
                    else reject(new Error('Invalid caption response.'));
                }
            };
            if (backgroundPort) backgroundPort.onMessage.addListener(specificHandler);
            else { reject(new Error('Background port not connected.')); return; }

            backgroundPort.postMessage({
                type: 'processLargeMedia',
                payload: { file: mediaFile, generationType: 'captions' }
            });
            setTimeout(() => {
                if (backgroundPort) backgroundPort.onMessage.removeListener(specificHandler);
                reject(new Error('Caption generation timed out.'));
            }, 360000);
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
      document.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);
      addGenerateCaptionsButton();
      setTimeout(addGenerateCaptionsButton, 500);
      setTimeout(addGenerateCaptionsButton, 2000);

      manualModeObserver = new MutationObserver((mutations) => {
        let shouldCheckForCaptions = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
              if (node instanceof HTMLElement) {
                if (node.matches(ALT_TEXT_SELECTOR)) addGenerateButton(node as HTMLTextAreaElement);
                node.querySelectorAll<HTMLTextAreaElement>(ALT_TEXT_SELECTOR).forEach(addGenerateButton);
                if (node.matches('div[role="dialog"]') || node.querySelector('video') || node.textContent?.includes('Caption')) {
                  shouldCheckForCaptions = true;
                }
              }
            });
          }
          if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
            if (mutation.target.matches(ALT_TEXT_SELECTOR)) addGenerateButton(mutation.target as HTMLTextAreaElement);
            if (mutation.target.matches('div[role="dialog"]') || mutation.target.querySelector('video')) {
                 shouldCheckForCaptions = true;
            }
          }
        }
        if (shouldCheckForCaptions) {
            setTimeout(addGenerateCaptionsButton, 300);
            setTimeout(addGenerateCaptionsButton, 1000);
        }
      });
      manualModeObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'placeholder', 'data-testid', 'role', 'style', 'class'] });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeAltTextAreas);
    } else {
      observeAltTextAreas();
    }
    console.log('Bluesky Alt Text Generator content script setup complete.');
  }
});