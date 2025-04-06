export default defineContentScript({
  matches: ['*://*.bsky.app/*'],
  main() {
    console.log('Bluesky Alt Text Generator loaded');
    
    // Only run in browser (not during build/ssr)
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
    // Constants
    const ALT_TEXT_SELECTOR = 'textarea[aria-label="Alt text"]';
    const BUTTON_ID = 'gemini-alt-text-button';
    
    // Add the button to an alt text textarea
    function addGenerateButton(textarea: HTMLTextAreaElement) {
      console.log('addGenerateButton called for textarea:', textarea); // Log function start and target

      // Prevent adding multiple buttons
      if (textarea.dataset.geminiButtonAdded === 'true') {
        console.log('Button already added to this textarea, skipping.');
        return;
      }

      // Find the parent element that likely contains the post button, etc.
      // Adjust the number of parentElement calls if the structure changes.
      // Let's use a more robust way, searching upwards for a container with specific characteristics
      // This is a placeholder - needs inspection if button placement is wrong
      let container = textarea.closest('div[data-testid="composer"]'); // Example: Look for a common composer container test ID
      if (!container) {
          // Fallback if the test ID isn't found or changes
          container = textarea.parentElement?.parentElement?.parentElement; 
          console.log('Using fallback container:', container);
      } else {
          console.log('Found container via closest():', container);
      }


      if (!container) {
        console.error('Could not find a suitable container for the button near textarea:', textarea);
        return;
      }
      
      // Check if button already exists within this specific container instance (less likely needed with the dataset check, but safe)
      if (container.querySelector(`#${BUTTON_ID}`)) {
        console.log('Button already exists in this container, skipping.');
        return;
      }


      // Create the button
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.title = 'Generate Alt Text'; // Add tooltip
      
      // Create icon element using the SVG from our extension
      const iconImg = document.createElement('img');
      iconImg.src = chrome.runtime.getURL('icon/gen-alt-text.svg');
      iconImg.alt = 'Generate Alt Text';
      iconImg.style.width = '20px';
      iconImg.style.height = '20px';
      iconImg.style.display = 'block';
      
      // Append the icon to the button
      button.appendChild(iconImg);
      
      // Style the button
      button.style.marginLeft = '8px'; // Add some spacing
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


      // Button click handler
      button.onclick = async (e) => { // Keep async for potential future needs, though connect is synchronous
        e.preventDefault(); 
        e.stopPropagation(); 

        console.log('Generate Alt Text button clicked');
        // Replace icon with text during states
        button.innerHTML = ''; // Clear icon
        button.textContent = 'Connecting...'; // Update initial state
        button.disabled = true;

        // Find image element (using the specific selector for now)
        let imageElement = document.querySelector('#root > div > div > div > div > div.css-175oi2r > div:nth-child(2) > div > div > div > div:nth-child(2) > div.css-175oi2r > div > div > img') as HTMLImageElement | null;
        console.log('Image found via specific selector:', imageElement);

        // Fallback (keep it simple for now, assume specific selector works)
        // if (!imageElement) { ... }

        if (!imageElement || !imageElement.src) {
          console.error('Could not find image element or its src using specific selector.');
          button.textContent = 'Error: No Image';
          setTimeout(() => {
             button.textContent = '';
             button.appendChild(iconImg.cloneNode(true));
             button.disabled = false;
            }, 2000);
          return;
        }

        const imageUrl = imageElement.src;
        console.log('Image URL:', imageUrl);

        try {
          console.log('Establishing connection to background script...');
          const port = chrome.runtime.connect({ name: "altTextGenerator" });
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
              setTimeout(() => {
                // Restore the icon after completion
                button.textContent = '';
                button.appendChild(iconImg.cloneNode(true));
                button.disabled = false;
              }, 1500);
            } else if (response.error) {
              console.error('Error generating alt text:', response.error);
              button.textContent = `Error: ${response.error.substring(0,20)}...`;
              setTimeout(() => {
                // Restore the icon after error
                button.textContent = '';
                button.appendChild(iconImg.cloneNode(true));
                button.disabled = false;
              }, 3000);
            } else {
              // Handle unexpected message format
              console.error('Received unexpected message format from background:', response);
               button.textContent = 'Msg Format Error';
               setTimeout(() => {
                 // Restore the icon after error
                 button.textContent = '';
                 button.appendChild(iconImg.cloneNode(true));
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
                   button.appendChild(iconImg.cloneNode(true));
                   button.disabled = false;
                  }, 3000);
            }
          });

          // Send the message to the background script via the port
          console.log('Sending message via port...');
          port.postMessage({ action: 'generateAltText', imageUrl: imageUrl });
          console.log('Message sent via port.');

        } catch (error) {
          // Catch errors related to establishing the connection itself
          console.error('Error establishing connection or posting initial message:', error);
          button.textContent = 'Connect Error';
           setTimeout(() => {
               // Restore the icon after error
               button.textContent = '';
               button.appendChild(iconImg.cloneNode(true));
               button.disabled = false;
              }, 2000);
        }
        // Note: No `finally` block needed here as the button state is handled by listeners
      };

      // Append the button - Try appending as the last child of the parent
      const parent = textarea.parentNode;
      if (parent) {
          console.log('Attempting to append button to parent:', parent);
          parent.appendChild(button);
      } else {
           console.error('Could not find parent node to append button to.');
      }
      
      // Mark the textarea so we don't add the button again
      textarea.dataset.geminiButtonAdded = 'true'; 
      
      console.log('Button insertion attempted. Check the DOM.');

    }
    
    // Helper to find the composer container from a textarea
    function findComposerContainer(element) {
      // Walk up the DOM to find the composer container
      // This might need adjustment based on Bluesky's DOM structure
      let current = element;
      // Look for a container that has the image preview
      while (current && current.tagName !== 'BODY') {
        // Try to find an img inside this container
        const imgPreview = current.querySelector('img[alt="Image preview"]');
        if (imgPreview) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }
    
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
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    console.log('Alt text generator initialized and watching for textareas');
  }
});