// Simplified background script
import browser from 'webextension-polyfill';

// Simple background script export
export default {
  main() {
    // Only execute this code in the browser, not during WXT's build process
    if (typeof browser !== 'undefined' && browser.runtime) {
      // Set up the connection handler
      browser.runtime.onConnect.addListener(port => {
        console.log('Background script connected to:', port.name);
        
        // Listen for messages
        port.onMessage.addListener(message => {
          console.log('Background received message:', message);
          
          // Send a response back
          port.postMessage({ 
            type: 'response', 
            message: 'Background received your message'
          });
        });
      });
      
      console.log('Background script initialized');
    }
  }
}; 