import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

// !! IMPORTANT: Replace with your actual Cloud Function URL after deployment !!
const CLOUD_FUNCTION_URL = 'https://us-central1-symm-gemini.cloudfunctions.net/generateAltTextProxy'; // e.g., 'https://us-central1-your-project-id.cloudfunctions.net/generateAltTextProxy'

// Check if the URL is a placeholder
// if (CLOUD_FUNCTION_URL === 'YOUR_FUNCTION_URL_HERE') {
//   console.warn('wxt.config.ts: CLOUD_FUNCTION_URL is set to placeholder. Remember to replace it with your deployed function URL.');
// }

let cloudFunctionOrigin = '*'; // Default to wildcard if URL is invalid or placeholder
try {
  // if (CLOUD_FUNCTION_URL !== 'YOUR_FUNCTION_URL_HERE') { // Removed redundant check
    cloudFunctionOrigin = new URL(CLOUD_FUNCTION_URL).origin + '/*';
  // }
} catch (e) {
  console.error('wxt.config.ts: Invalid CLOUD_FUNCTION_URL provided:', CLOUD_FUNCTION_URL);
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Remove the imports section for now as it's causing issues
  vite: () => ({
    plugins: [react()],
    // Define environment variables here
    define: {
      'import.meta.env.VITE_CLOUD_FUNCTION_URL': JSON.stringify(CLOUD_FUNCTION_URL),
    },
    // Add sourcemap: false to prevent issues with Vue hot reloading
    build: {
      sourcemap: false
    }
  }),
  manifest: ({ browser, manifestVersion, mode, command }) => ({
    name: `Bluesky Alt Text Generator`, // Indicate Dev mode
    description: 'Uses Gemini to automatically generate alt text for images and videos you post on Bluesky.',
    homepage_url: 'https://github.com/symmetricalboy/gen-alt-text',
    author: 'symmetricalboy',
    
    // Permissions needed
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'contextMenus',
      'offscreen' // Add offscreen permission
    ],
    host_permissions: [
      '*://*.bsky.app/*', // Allow interaction with Bluesky pages
      'https://us-central1-symm-gemini.cloudfunctions.net/*', // For the cloud function
      // Remove Gemini permission:
      // 'https://generativelanguage.googleapis.com/*',
      // Add Cloud Function permission:
      cloudFunctionOrigin // Use the derived origin pattern
    ],
    
    // Content Security Policy
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; script-src-elem 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
      // sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';" // if you use sandboxed pages
    },

    // Configure background script as a service worker
    background: {
      service_worker: 'background.js'
    },

    // Web accessible resources for icon usage in content scripts
    web_accessible_resources: [
      {
        // For content scripts to access icons and potentially other assets if needed directly
        resources: ['icons/*', 'assets/ui/*'], // Example: if you have UI assets
        matches: ['*://*.bsky.app/*']
      },
      {
        // For FFmpeg assets, making them accessible primarily to the extension itself.
        // The service worker needs to load ffmpeg.js via importScripts,
        // and ffmpeg.js/ffmpeg-core.js might need to load .wasm and .worker.js files.
        resources: [
          'assets/ffmpeg/*',
          'offscreen.html',
          'offscreen-ffmpeg-handler.js'
        ],
        // Using <all_urls> for now to bypass build error with dynamic ID.
        // CSP script-src 'self' is the more direct controller for importScripts.
        matches: ['<all_urls>'], 
        use_dynamic_url: true // Recommended for WASM and worker scripts
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
      default_title: 'Bluesky Alt Text Generator Options',
      default_popup: 'popup.html',
    },
    
    // Icons - using default ones from WXT for now
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '96': 'icons/icon-96.png',
      '128': 'icons/icon-128.png',
    },
    
    // Options (Removed as no options page is implemented yet)
    // options_ui: {
    //   page: 'entrypoints/options/index.html',
    //   open_in_tab: true,
    // }
  }),
  
  // Single MV3 package for all browsers
  outDir: '.output',
  // Only build for Chrome MV3, which is compatible with most Chromium browsers
  // For Firefox or Safari, we can load the same package and the browser will
  // handle the compatibility
  // targets: ['chrome-mv3'], // Removed invalid 'targets' property
  
  // Define the URL as an environment variable for the extension build
  // env: { // Moved to vite->define
  //   VITE_CLOUD_FUNCTION_URL: CLOUD_FUNCTION_URL,
  // },
});
