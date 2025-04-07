# Bluesky Alt Text Generator (Chrome/Firefox Extension)

![Extension Icon](./public/icon/gen-alt-text.svg)

This browser extension automatically generates detailed, accessible alt text for images and videos you add to posts on Bluesky, using Google Gemini AI.

## Features

*   **Automatic Alt Text Generation:** Get suggested alt text instantly when you upload media.
*   **Manual Generation:** Click the ✨ icon next to the alt text field to generate text on demand.
*   **Auto-Mode:** Automatically opens the alt text input and generates text when media is added (configurable).
*   **Configurable:** Enable/disable auto-mode and notification toasts via the extension popup.
*   **Privacy-Focused:** Media processing happens via the secure Google AI API.

## Installation

*(Instructions for installing from Chrome Web Store / Firefox Add-ons or loading as an unpacked extension will go here)*

1.  **From Store (Recommended):**
    *   Coming Soon!
2.  **Load Unpacked (Developer):**
    *   Clone this repository: `git clone https://github.com/symmetricalboy/gen-alt-text.git`
    *   Install dependencies: `npm install`
    *   Build the extension: `npm run build`
    *   Open Chrome/Edge, go to `chrome://extensions` or `edge://extensions`.
    *   Enable "Developer mode".
    *   Click "Load unpacked" and select the `.output/chrome-mv3` directory.
    *   (For Firefox, use `.output/firefox-mv3`)

## Usage

1.  Once installed, the extension is active on `bsky.app`.
2.  **Manual Mode:** When you upload an image or video and open the alt text input field (usually by clicking "ALT" or a similar button), you will see a ✨ icon appear. Click this icon to generate alt text.
3.  **Auto-Mode:** If enabled in the extension popup, when you add an image or video to a post, the extension will attempt to automatically open the alt text input and generate text.
4.  **Review:** Always review the generated alt text before posting! AI can make mistakes.

## Configuration

Click the extension icon in your browser toolbar to open the popup. Here you can:

*   Toggle **Auto-generate mode** on or off.
*   Toggle **Show notifications** (toasts) on or off.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please check the [issues](https://github.com/symmetricalboy/gen-alt-text/issues) page.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Feedback

Feedback, suggestions, and assistance are welcome at [@symm.app on Bluesky](https://bsky.app/profile/symm.app). 