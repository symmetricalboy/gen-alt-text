import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: ({ browser, manifestVersion, mode, command }) => ({
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
    
    // Web accessible resources for icon usage in content scripts
    web_accessible_resources: [
      {
        resources: ['icon/*'],
        matches: ['*://*.bsky.app/*']
      }
    ],
    
    // Browsers compatibility - add browser-specific settings conditionally
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: '{bf28fcb2-7a85-44b3-add7-7a47fdd9a4a4}' // Random UUID for Firefox
        }
      }
    }),
    
    // Browser action settings
    action: {
      default_title: 'Bluesky Alt Text Generator',
      default_popup: 'popup.html'
    },
    
    // Icons - using default ones from WXT for now
    
    // Options (Removed as no options page is implemented yet)
    // options_ui: {
    //   page: 'options.html',
    //   open_in_tab: true
    // }
  }),
  
  // Single MV3 package for all browsers
  outDir: '.output/chrome-firefox-safari-mv3',
  // Only build for Chrome MV3, which is compatible with most Chromium browsers
  // For Firefox or Safari, we can load the same package and the browser will
  // handle the compatibility
  targets: ['chrome-mv3'],
});
