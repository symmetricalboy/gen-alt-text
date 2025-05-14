# Bluesky Alt Text Generator (Chrome/Firefox Extension)

![Extension Icon](./public/icons/gen-alt-text.svg)

This browser extension helps you generate detailed, accessible alt text for images and videos you add to posts on Bluesky, using Google Gemini AI.

## Features

*   **Manual Generation:** Adds a ✨ button next to alt text fields on bsky.app. Click it to generate text on demand.
*   **Supports Images & Videos:** Can generate alt text based on the content of both image and video uploads.
*   **Toast Notifications:** Displays a confirmation message after generation, reminding you to review the text.
*   **Privacy-Focused:** Media processing happens via the secure Google AI API.
*   **Web App Available:** If you don't want to install an extension, you can use the [web app](https://alttext.symm.app) to generate alt text for any media.

## Web Application

We also offer a simple web application that you can use from any device:

**[https://alttext.symm.app](https://alttext.symm.app)**

The web app allows you to:
- Upload images or videos (up to 10MB)
- Generate AI-powered alt text
- Copy the results to your clipboard

No installation required - just visit the site and start generating accessible alt text!

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


I need to revise this documentation extensively, but the extension is working as expected. You can build it yourself in its entirety, by running:
```cmd
npm install && npx wxt build -b chrome --mv3 && npx wxt zip -b chrome --mv3 && npx wxt build -b firefox --mv2 && npx wxt zip -b firefox --mv2
```

Let me also jot this down here for future reference:
```cmd
cd functions && gcloud functions deploy generateAltTextProxy --gen2 --runtime=nodejs20 --trigger-http --allow-unauthenticated
```
