// Content script implementation logic
// This file should be imported by the entrypoint
import { GenerateAltTextRequest, AltTextResponse } from '../types';

// Constants
export const ALT_TEXT_SELECTOR = 'textarea[aria-label="Image description"]';
export const BUTTON_ID = 'gemini-alt-text-button';

// Using a named export function that we don't call during the import phase
// This prevents the code from executing during Vite's pre-rendering phase
export function initContentScript() {
  console.log('Alt Text Gen Script initializing on bsky.app');

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.warn('Content script running in non-browser environment, skipping DOM operations');
    return;
  }
  
  // Function to add the button next to the alt text textarea
  function addGenerateButton(textarea) {
    if (textarea.parentElement?.querySelector(`#${BUTTON_ID}`)) return;
    
    console.log('Found alt text area:', textarea);

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.textContent = '✨ Gen Alt Text';
    button.type = 'button';
    button.style.marginLeft = '8px';
    button.style.padding = '4px 8px';
    button.style.fontSize = '0.8em';
    button.style.border = '1px solid #ccc';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.backgroundColor = '#f0f0f0';

    button.addEventListener('click', async () => {
      console.log('Generate Alt Text button clicked!');
      button.textContent = 'Generating...';
      button.disabled = true;

      try {
        const container = textarea.closest('div[style*="width: 100%;"]');
        const imgElement = container?.querySelector('img[alt="Image preview"]');

        if (!imgElement || !imgElement.src) {
          console.error('Could not find associated image element or its src.');
          alert('Error: Could not find the image for this alt text field.');
          button.textContent = '✨ Gen Alt Text';
          button.disabled = false;
          return;
        }

        const imageUrl = imgElement.src;
        console.log('Sending image URL to background:', imageUrl);

        const response = await browser.runtime.sendMessage({
          type: 'GENERATE_ALT_TEXT',
          imageUrl: imageUrl,
        });

        console.log('Received response from background:', response);

        if (response.error) {
          throw new Error(response.error);
        }

        if (response.text) {
          textarea.value = response.text;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('Alt text populated.');
        } else {
          throw new Error('Background script did not return text.');
        }

      } catch (error) {
        console.error('Error in alt text generation process:', error);
        alert(`Error generating alt text: ${error.message || 'Unknown error'}`);
      } finally {
        button.textContent = '✨ Gen Alt Text';
        button.disabled = false;
      }
    });

    textarea.insertAdjacentElement('afterend', button);
    console.log('Button injected.');
  }

  // Add button to existing textareas
  document.querySelectorAll(ALT_TEXT_SELECTOR).forEach(textarea => {
    addGenerateButton(textarea);
  });
  
  // We only want to set up the MutationObserver if we're in a browser
  if (typeof MutationObserver !== 'undefined') {
    // Watch for new textareas
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (element.matches && element.matches(ALT_TEXT_SELECTOR)) {
                addGenerateButton(element);
              }
              if (element.querySelectorAll) {
                element.querySelectorAll(ALT_TEXT_SELECTOR).forEach(textarea => {
                  addGenerateButton(textarea);
                });
              }
            }
          });
        }
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('MutationObserver set up for alt text textareas.');
  }
} 