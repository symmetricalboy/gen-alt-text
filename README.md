# Bluesky Alt Text Generator (Chrome/Firefox Extension)

![Extension Icon](./public/icon/gen-alt-text.svg)

This browser extension helps you generate detailed, accessible alt text for images and videos you add to posts on Bluesky, using Google Gemini AI.

## Features

*   **Manual Generation:** Adds a ✨ button next to alt text fields on bsky.app. Click it to generate text on demand.
*   **Supports Images & Videos:** Can generate alt text based on the content of both image and video uploads.
*   **Toast Notifications:** Displays a confirmation message after generation, reminding you to review the text.
*   **Privacy-Focused:** Media processing happens via the secure Google AI API.

## Installation

*(Instructions for installing from Chrome Web Store / Firefox Add-ons will go here)*

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
2.  When you upload an image or video and open the alt text input field (usually by clicking "ALT" or a similar button on the media preview), you will see a ✨ icon appear next to the text area.
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
