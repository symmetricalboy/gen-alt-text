import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Bluesky Alt Text Generator',
    description: 'Automatically generate accessible alt text for images on Bluesky using Google Gemini AI.',
    version: '0.1.0',
    author: 'Your Name',
    
    // Permissions needed
    permissions: [],
    host_permissions: [
      '*://*.bsky.app/*',               // Access to Bluesky
      'https://generativelanguage.googleapis.com/*' // Gemini API
    ],
    
    // Browsers compatibility
    browser_specific_settings: {
      gecko: {
        id: '{bf28fcb2-7a85-44b3-add7-7a47fdd9a4a4}' // Random UUID for Firefox
      }
    },
    
    // Icons - using default ones from WXT for now
    
    // Options (Removed as no options page is implemented yet)
    // options_ui: {
    //   page: 'options.html',
    //   open_in_tab: true
    // }
  },
  
  // Build configuration for different browsers
  build: {
    // Firefox (MV3) specific configuration
    firefox: {
      target: 'manifest-v3',
    },
    // Chrome (MV3) specific configuration
    chrome: {
      target: 'manifest-v3',
    },
    // Safari (MV3) specific configuration
    safari: {
      target: 'manifest-v3',
    }
  }
});
