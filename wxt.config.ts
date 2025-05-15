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
      // 'activeTab',     // Can be useful for context, but might not be strictly necessary depending on approach
      // 'scripting',     // Required to inject content scripts
      // 'contextMenus', // If adding a right-click menu item later
      // 'alarms',      // If needing scheduled tasks
    ],
    host_permissions: [
      '*://*.bsky.app/*', // Allow interaction with Bluesky pages
      // Remove Gemini permission:
      // 'https://generativelanguage.googleapis.com/*',
      // Add Cloud Function permission:
      cloudFunctionOrigin // Use the derived origin pattern
    ],
    
    // Content Security Policy
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      // sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';" // if you use sandboxed pages
    },

    // Web accessible resources for icon usage in content scripts
    web_accessible_resources: [
      {
        resources: ['icons/*', 'assets/*', 'assets/ffmpeg/*'], // Added assets/ffmpeg/*
        matches: ['*://*.bsky.app/*']
      },
      // Make FFmpeg core files accessible for loading by the FFmpeg library itself
      {
        resources: ['assets/ffmpeg/ffmpeg-core.wasm', 'assets/ffmpeg/ffmpeg-core.worker.js'], // Be explicit if needed
        matches: ['<all_urls>'], // Or more restrictively, the extension's own origin
        use_dynamic_url: true // Important for some browsers/setups with Wasm
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
      // No popup for now, handled by content script interaction
      // default_popup: 'entrypoints/popup/index.html',
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
