# Bluesky Alt Text Generator (Chrome/Firefox Extension & Web App)

![Extension Icon](./public/icons/gen-alt-text.svg)

This browser extension helps you generate detailed, accessible alt text and captions for images and videos you add to posts on Bluesky, using Google Gemini AI.

## Features

*   **AI-Powered Generation:** Adds a ✨ button next to alt text fields on `bsky.app`. Click it to generate alt text or captions on demand.
*   **Supports Images & Videos:** Can generate alt text and captions based on the content of both image and video uploads, including Tenor GIFs.
*   **Toast Notifications:** Displays a confirmation message after generation, reminding you to review the text.
*   **Privacy-Focused:** Media processing happens via a secure Google Cloud Function proxy to the Google AI API.
*   **Web App Available:** If you don't want to install an extension, or want to generate alt text for media outside of Bluesky, you can use the [web app](https://alttext.symm.app).

## Web Application

We also offer a simple web application that you can use from any device:

**[https://alttext.symm.app](https://alttext.symm.app)**

The web app allows you to:
- Upload images or videos (up to 10MB)
- Generate AI-powered alt text and captions
- Copy the results to your clipboard

No installation required - just visit the site and start generating accessible alt text!

## Installation

1.  **From Store (Recommended):**
    *   **Firefox:** [Get it from Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/bluesky-alt-text-generator/)
    *   **Chrome/Edge:** Coming Soon to the Chrome Web Store!
2.  **Load Unpacked (Developer):**
    *   Clone this repository: `git clone https://github.com/symmetricalboy/gen-alt-text.git`
    *   Install dependencies: `npm install`
    *   Build the extension: `npm run build`
    *   Open Chrome/Edge, go to `chrome://extensions` or `edge://extensions`.
    *   Enable "Developer mode".
    *   Click "Load unpacked" and select the `.output/chrome-mv3` directory.
    *   (For Firefox, use `.output/firefox-mv2` if you are building the MV2 version, or `.output/firefox-mv3` for the MV3 version - note that the store version is MV2)

## Usage

1.  Once installed, the extension is active on `bsky.app`.
2.  When you upload an image or video and open the alt text input field (usually by clicking "ALT" or a similar button on the media preview), you will see a ✨ button appear next to the text area.
3.  Click this icon to generate alt text based on the media.
4.  **Review:** Always review the generated alt text before posting! AI can make mistakes. The generated text will appear in the input field, and a toast notification will confirm success or report errors.

## Configuration

There are no configurable options. The extension automatically adds the generate button to relevant fields on bsky.app.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please check the [issues](https://github.com/symmetricalboy/gen-alt-text/issues) page.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Feedback

Feedback, suggestions, and assistance are welcome at [@symm.app on Bluesky](https://bsky.app/profile/symm.app). 


I need to revise this documentation extensively, but the extension is working as expected. You can build it yourself in its entirety, by running:
```cmd
npm install && npx wxt build -b chrome --mv3 && npx wxt zip -b chrome --mv3 && npx wxt build -b firefox --mv2 && npx wxt zip -b firefox --mv2
```

Let me also jot this down here for future reference:
```cmd
cd functions && gcloud functions deploy generateAltTextProxy --gen2 --runtime=nodejs20 --trigger-http --allow-unauthenticated
```

# Alt Text Extension

Browser extension for automatically generating accessible alt text for images & videos using Google Gemini AI.

## Features

- Automatic alt text generation for images and videos
- Support for Chrome, Firefox, and Safari
- Video compression for large files
- Integration with Bluesky social media platform
- Offline-capable with local FFmpeg processing

## Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- PowerShell (for Windows build scripts)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Development mode:
```bash
# Chrome
npm run dev:chrome

# Firefox  
npm run dev:firefox

# Safari
npm run dev:safari
```

3. Build for production:
```bash
# Build for all browsers
npm run build

# Build for specific browser
npm run build:chrome
npm run build:firefox
npm run build:safari
```

### Project Structure

```
alt-text-ext/
├── entrypoints/        # Extension entry points
│   ├── background.ts   # Background service worker
│   ├── content.ts      # Content scripts
│   └── popup/          # Extension popup UI
├── lib/                # Shared libraries
├── public/             # Static assets
│   ├── assets/         # FFmpeg and other assets
│   ├── icons/          # Extension icons
│   └── offscreen*      # Offscreen document files
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── wxt.config.ts       # WXT framework configuration
```

### Configuration

The extension ID is configured in `wxt.config.ts`. Update this for your own deployment.

### API Configuration

The extension communicates with a cloud function for AI processing. The API endpoint is configured in the background script.

## Deployment

1. Build the extension:
```bash
npm run build:unified
```

2. The built extension will be in `.output/` directory

3. Load the unpacked extension in your browser's developer mode or submit to browser stores

## License

[Your license here] 