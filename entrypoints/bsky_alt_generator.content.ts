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
    function addGenerateButton(textarea) {
      // Avoid duplicates
      if (textarea.parentElement?.querySelector(`#${BUTTON_ID}`)) {
        return;
      }
      
      console.log('Found alt text textarea - adding button');
      
      // Create button
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.textContent = '✨ Gen Alt Text';
      button.type = 'button';
      button.style.cssText = `
        margin-top: 8px;
        padding: 6px 12px;
        background: linear-gradient(90deg, #7C3AED 0%, #5B21B6 100%);
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      `;
      
      // Add hover effect
      button.addEventListener('mouseover', () => {
        button.style.opacity = '0.9';
        button.style.transform = 'translateY(-1px)';
      });
      button.addEventListener('mouseout', () => {
        button.style.opacity = '1';
        button.style.transform = 'translateY(0)';
      });
      
      // Add click handler
      button.addEventListener('click', async () => {
        // Find the associated image
        const composerContainer = findComposerContainer(textarea);
        if (!composerContainer) {
          alert('Could not find the composer container');
          return;
        }
        
        // Find the image preview
        const imagePreview = composerContainer.querySelector('img[alt="Image preview"]');
        if (!imagePreview || !imagePreview.src) {
          alert('Could not find the image preview');
          return;
        }
        
        // Show loading state
        const originalText = button.textContent;
        button.textContent = '⏳ Generating...';
        button.disabled = true;
        button.style.opacity = '0.7';
        
        try {
          // Send message to background script
          const response = await browser.runtime.sendMessage({
            type: 'GENERATE_ALT_TEXT',
            imageUrl: imagePreview.src
          });
          
          if (!response.success) {
            throw new Error(response.error || 'Failed to generate alt text');
          }
          
          // Update the textarea with the generated alt text
          textarea.value = response.altText;
          
          // Trigger input event so Bluesky registers the change
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          
          console.log('Alt text updated successfully');
          
          // Show success state briefly
          button.textContent = '✓ Done!';
          button.style.background = 'linear-gradient(90deg, #059669 0%, #10B981 100%)';
          
          // Reset after 2 seconds
          setTimeout(() => {
            button.textContent = originalText;
            button.style.background = 'linear-gradient(90deg, #7C3AED 0%, #5B21B6 100%)';
            button.disabled = false;
            button.style.opacity = '1';
          }, 2000);
          
        } catch (error) {
          console.error('Error generating alt text:', error);
          
          // Show error state
          button.textContent = '❌ Error';
          button.style.background = 'linear-gradient(90deg, #DC2626 0%, #EF4444 100%)';
          
          // Show error message
          alert(`Error: ${error.message || 'Failed to generate alt text'}`);
          
          // Reset after 2 seconds
          setTimeout(() => {
            button.textContent = originalText;
            button.style.background = 'linear-gradient(90deg, #7C3AED 0%, #5B21B6 100%)';
            button.disabled = false;
            button.style.opacity = '1';
          }, 2000);
        }
      });
      
      // Add the button after the textarea
      textarea.parentElement.appendChild(button);
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
      addGenerateButton(textarea);
    });
    
    // Watch for dynamically added textareas
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            // Check if the added node is an element
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's a textarea with the right aria-label
              if (node.matches && node.matches(ALT_TEXT_SELECTOR)) {
                addGenerateButton(node);
              }
              
              // Check if it contains any matching textareas
              if (node.querySelectorAll) {
                node.querySelectorAll(ALT_TEXT_SELECTOR).forEach(textarea => {
                  addGenerateButton(textarea);
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