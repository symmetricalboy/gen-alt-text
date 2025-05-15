import browser from 'webextension-polyfill';

// Export default object for WXT
export default {
  matches: ['*://*.google.com/*'],
  main() {
    console.log('Hello content.');

    // Add message listener if needed
    browser.runtime.onMessage.addListener((message) => {
      console.log('Content script received message:', message);
      return true;
    });
  }
};
