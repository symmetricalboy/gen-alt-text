import browser from 'webextension-polyfill';

// Export bare minimum default to satisfy WXT's build process
export default {
  // Matches Bluesky domains
  matches: ['*://*.bsky.app/*'],
  
  // Main function that will run when the content script is loaded
  main() {
    console.log('Bluesky Alt Text Generator loaded');
    
    if (typeof document !== 'undefined') {
      // Define the selector for alt text areas
      const ALT_TEXT_SELECTOR = 'textarea[placeholder*="Alt text"], textarea[aria-label*="Alt text"]';
      
      // Initialize the observer when the DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          console.log('Setting up observer on DOMContentLoaded');
        });
      } else {
        console.log('DOM already loaded, setting up observer now');
      }
    }
  }
}; 