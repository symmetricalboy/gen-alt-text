# Bluesky Alt Text Generator

![Extension Icon](./icons/gen-alt-text.svg)

An intelligent, AI-powered solution for generating accessible alt text and captions for images and videos. Make the web more accessible with Google Gemini AI integration across multiple platforms.

## 🌟 Available Platforms

### 🌐 **Web Application** (Recommended for quick use)
**Live at: [https://alttext.symm.app](https://alttext.symm.app)**
- Drag-and-drop interface for images and videos
- No installation required, works on any device
- Advanced video compression with FFmpeg
- Progressive Web App (PWA) with offline support

**Repository:** [alt-text-web](https://github.com/symmetricalboy/alt-text-web)

### 🧩 **Browser Extension** (Seamless Bluesky integration)
**Available on:**
- **Firefox:** [Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/bluesky-alt-text-generator/)
- **Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/bdgpkmjnfildfjhpjagjibfnfpdieddp)

Adds a ✨ button directly to Bluesky's alt text fields for instant generation.

**Repository:** [alt-text-ext](https://github.com/symmetricalboy/alt-text-ext)

## 🏗️ Project Architecture

This project consists of four specialized repositories working together:

### 📱 **[alt-text-ext](https://github.com/symmetricalboy/alt-text-ext)** - Browser Extension
Cross-browser extension built with WXT.dev framework
- **Features:** Seamless Bluesky integration, advanced video processing, FFmpeg compression
- **Platforms:** Chrome, Firefox, Safari
- **Technology:** TypeScript, Manifest V3, FFmpeg.wasm

### 🖥️ **[alt-text-web](https://github.com/symmetricalboy/alt-text-web)** - Web Application  
Progressive Web App for standalone use
- **Features:** Drag-and-drop interface, real-time compression, offline support
- **Deployment:** Railway (https://alttext.symm.app)
- **Technology:** Vanilla JavaScript, PWA, Express.js

### ⚙️ **[alt-text-server](https://github.com/symmetricalboy/alt-text-server)** - Backend API
Centralized AI processing server for all clients
- **Features:** Google Gemini integration, specialized AI instructions, large file handling
- **Deployment:** Railway with automatic scaling
- **Technology:** Node.js, Express, @google/genai SDK

### 📚 **gen-alt-text** (This Repository) - Project Hub
Central coordination, documentation, and releases
- **Contents:** Project assets, comprehensive documentation, release management
- **Purpose:** Single source of truth for the entire project

## ✨ Key Features

- **🤖 AI-Powered Generation:** Advanced Google Gemini AI with specialized instructions
- **📹 Video Processing:** Automatic compression with multiple codec support (H.264, VP8, VP9)
- **📱 Cross-Platform:** Browser extension + web app for maximum accessibility
- **🔒 Privacy-Focused:** Secure processing with no permanent data storage
- **🎯 Accessibility-First:** Purpose-built for screen reader compatibility
- **⚡ Real-time Feedback:** Live progress indicators and compression logs

## 🚀 Quick Start

### For Immediate Use:
1. **Web App:** Visit [alttext.symm.app](https://alttext.symm.app)
2. **Extension:** Install from [Chrome](https://chromewebstore.google.com/detail/bdgpkmjnfildfjhpjagjibfnfpdieddp) or [Firefox](https://addons.mozilla.org/en-US/firefox/addon/bluesky-alt-text-generator/) stores

### For Developers:
1. **Documentation:** Complete guides in [`/docs`](./docs/)
2. **Development:** See [Development Guide](./docs/development-guide.md)
3. **Architecture:** Review [Technical Architecture](./docs/technical-architecture.md)

## 📖 Documentation

Comprehensive documentation is available in the [`/docs`](./docs/) directory:

- **[📋 Current State Analysis](./docs/current-state-analysis.md)** - Project status and roadmap
- **[🏗️ Technical Architecture](./docs/technical-architecture.md)** - System design and data flow
- **[🧩 Browser Extension Guide](./docs/browser-extension.md)** - Extension development and deployment
- **[⚙️ Backend Server Guide](./docs/backend-server.md)** - API documentation and deployment
- **[👨‍💻 Development Guide](./docs/development-guide.md)** - Local setup and debugging
- **[🛣️ Project Roadmap](./docs/roadmap.md)** - Future development plans

## 📊 Project Status

| Component | Version | Status | Deployment |
|-----------|---------|--------|------------|
| **Web App** | 1.0.0 | ✅ Production | [alttext.symm.app](https://alttext.symm.app) |
| **Backend** | 1.0.0 | ✅ Production | Railway |
| **Extension** | 1.0.0 dev / 0.3.1 store | ⚠️ Store Update Needed | Chrome & Firefox Stores |
| **Documentation** | 1.0.0 | ✅ Complete | This repository |

## 🔗 Links & Resources

- **🌐 Live Web App:** [alttext.symm.app](https://alttext.symm.app)
- **🧩 Chrome Extension:** [Chrome Web Store](https://chromewebstore.google.com/detail/bdgpkmjnfildfjhpjagjibfnfpdieddp)
- **🦊 Firefox Extension:** [Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/bluesky-alt-text-generator/)
- **📱 Bluesky Profile:** [@symm.app](https://bsky.app/profile/symm.app)
- **🐛 Issues & Support:** [GitHub Issues](https://github.com/symmetricalboy/gen-alt-text/issues)

## 🤝 Contributing

Contributions are welcome! This project spans multiple repositories:

- **🧩 Extension issues:** [alt-text-ext issues](https://github.com/symmetricalboy/alt-text-ext/issues)
- **🖥️ Web app issues:** [alt-text-web issues](https://github.com/symmetricalboy/alt-text-web/issues)  
- **⚙️ Server issues:** [alt-text-server issues](https://github.com/symmetricalboy/alt-text-server/issues)
- **📚 General/documentation:** [gen-alt-text issues](https://github.com/symmetricalboy/gen-alt-text/issues)

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

**Making the web more accessible, one image at a time. 🌟** 