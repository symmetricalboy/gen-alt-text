# Development Guide

## Getting Started

This guide covers local development setup, debugging procedures, and testing strategies for all components of the Bluesky Alt Text Generator project.

## Prerequisites

### Required Software
- **Node.js**: v18.0.0 or higher (v20 recommended)
- **npm**: v9.0.0 or higher (comes with Node.js)
- **Git**: Latest version
- **Browser**: Chrome, Firefox, or Safari for extension development

### Optional Tools
- **VS Code**: Recommended IDE with extensions:
  - TypeScript Language Service
  - WXT.dev extension support
  - REST Client for API testing
- **Postman/Insomnia**: API testing
- **Chrome DevTools**: Extension debugging

### Environment Setup
```bash
# Install Node.js (Windows with PowerShell)
winget install OpenJS.NodeJS

# Verify installation
node --version  # Should be v18+ 
npm --version   # Should be v9+
```

## Repository Setup

### 1. Clone All Repositories
```bash
# Navigate to your development directory
cd C:\Users\[username]\Documents\GitHub

# Clone all repositories
git clone https://github.com/symmetricalboy/gen-alt-text.git
git clone https://github.com/symmetricalboy/alt-text-ext.git
git clone https://github.com/symmetricalboy/alt-text-server.git
git clone https://github.com/symmetricalboy/alt-text-web.git
```

### 2. Install Dependencies

#### Browser Extension (alt-text-ext)
```bash
cd alt-text-ext
npm install
npm run postinstall  # WXT preparation
```

#### Backend Server (alt-text-server)
```bash
cd alt-text-server
npm install

# Create environment file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

#### Web Application (alt-text-web)
```bash
cd alt-text-web
npm install
```

## Development Servers

### Browser Extension Development

#### Chrome Development
```bash
cd alt-text-ext
npm run dev:chrome
```
- Extension builds to `.output/chrome-mv3/`
- Load unpacked extension in Chrome from that directory
- Hot reload enabled for most changes

#### Firefox Development
```bash
npm run dev:firefox
```
- Extension builds to `.output/firefox-mv2/`
- Load temporary add-on in Firefox from `manifest.json`

#### Safari Development
```bash
npm run dev:safari
```
- Requires Safari Technology Preview for testing
- Extension builds to `.output/safari/`

### Backend Server Development
```bash
cd alt-text-server
npm run dev
```
- Server runs on `http://localhost:3000`
- Nodemon provides automatic restart on file changes
- Health endpoint available at `/health`

### Web Application Development
```bash
cd alt-text-web
npm start
```
- Application runs on `http://localhost:8080`
- Static file serving with proper COEP/COOP headers
- Manual refresh required for changes

## API Keys & Configuration

### Google Gemini API Key Setup

1. **Obtain API Key**:
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create new API key
   - Copy the key securely

2. **Backend Server Configuration**:
   ```bash
   # In alt-text-server/.env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

3. **Extension Configuration**:
   ```typescript
   // In alt-text-ext/wxt.config.ts
   const CLOUD_FUNCTION_URL = 'http://localhost:3000/generate-alt-text';
   ```

4. **Web App Configuration**:
   ```javascript
   // In alt-text-web/public/index.html
   const API_ENDPOINT = 'http://localhost:3000/generate-alt-text';
   ```

## Development Workflow

### Typical Development Session

1. **Start Backend Server**:
   ```bash
   cd alt-text-server
   npm run dev
   ```

2. **Start Extension Development**:
   ```bash
   cd alt-text-ext
   npm run dev:chrome
   ```

3. **Load Extension in Browser**:
   - Open Chrome
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `.output/chrome-mv3/` directory

4. **Test on Bluesky**:
   - Visit `https://bsky.app`
   - Create new post with image/video
   - Look for ✨ button next to alt text field

### Web App Development

1. **Start Web App**:
   ```bash
   cd alt-text-web
   npm start
   ```

2. **Test Locally**:
   - Visit `http://localhost:8080`
   - Test file upload and compression
   - Verify API communication

## Debugging Strategies

### Extension Debugging

#### Background Script Debugging
```bash
# Chrome DevTools
1. Go to chrome://extensions/
2. Find your extension
3. Click "service worker" link
4. Use console for debugging
```

#### Content Script Debugging
```bash
# On Bluesky page
1. Open Chrome DevTools (F12)
2. Go to Sources tab
3. Find content script files
4. Set breakpoints as needed
```

#### Offscreen Document Debugging
```bash
# Special debugging for FFmpeg processing
1. Add debugger; statements in offscreen-ffmpeg-handler.js
2. Look for "Offscreen Document" in Chrome task manager
3. Right-click and "Inspect" to open DevTools
```

### Backend Server Debugging

#### Console Logging
```javascript
// Enhanced logging for development
console.log('API Request:', {
  mimeType: req.body.mimeType,
  dataSize: req.body.base64Data?.length,
  action: req.body.action
});
```

#### Request/Response Inspection
```bash
# Use curl for API testing
curl -X POST http://localhost:3000/generate-alt-text \
  -H "Content-Type: application/json" \
  -d '{"base64Data":"...","mimeType":"image/jpeg"}'
```

### Web App Debugging

#### Browser DevTools
- **Console**: JavaScript errors and logs
- **Network**: API request/response inspection
- **Application**: Service Worker and cache inspection
- **Performance**: FFmpeg processing analysis

#### FFmpeg Debugging
```javascript
// Enable FFmpeg logs in compression-worker.js
ffmpeg.setLogger(({ message }) => {
  console.log('FFmpeg:', message);
});
```

## Testing Procedures

### Manual Testing Checklist

#### Extension Testing
- [ ] ✨ button appears on Bluesky alt text fields
- [ ] Image upload and processing works
- [ ] Video compression and processing works
- [ ] Toast notifications display correctly
- [ ] Error handling works gracefully
- [ ] Cross-tab functionality works

#### Backend Testing  
- [ ] `/health` endpoint returns 200 OK
- [ ] Image processing generates alt text
- [ ] Video processing generates captions
- [ ] Large file handling works
- [ ] Error responses are meaningful

#### Web App Testing
- [ ] File upload (drag & drop) works
- [ ] Video compression shows progress
- [ ] Generated content displays correctly
- [ ] Copy to clipboard functions
- [ ] PWA installation works

### Automated Testing

#### Extension Testing with Playwright
```bash
cd alt-text-ext
npm test  # If test script exists
```

#### API Testing
```bash
# Using curl or create test scripts
cd alt-text-server
# Create test scripts in tests/ directory
```

### Testing Different File Types

#### Supported Image Formats
- **JPEG**: Standard photos from phones/cameras
- **PNG**: Screenshots, graphics with transparency
- **WebP**: Modern web format
- **GIF**: Animated and static GIFs

#### Supported Video Formats
- **MP4**: Most common video format
- **WebM**: Web-optimized videos
- **MOV**: iPhone/Mac videos
- **AVI**: Older video format

#### Test File Sizes
- **Small**: < 1MB (instant processing)
- **Medium**: 1-15MB (direct upload)
- **Large**: 15-100MB (compression required)
- **Very Large**: > 100MB (aggressive compression)

## Performance Testing

### Video Compression Benchmarks
```javascript
// Time compression operations
const startTime = performance.now();
const result = await compressVideo(file);
const endTime = performance.now();
console.log(`Compression took ${endTime - startTime}ms`);
```

### Memory Usage Monitoring
```javascript
// Monitor memory in extension
setInterval(() => {
  if (performance.memory) {
    console.log('Memory:', {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    });
  }
}, 5000);
```

## Common Issues & Solutions

### Development Issues

#### "Module not found" Errors
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

#### Extension Not Loading
- Check manifest.json for syntax errors
- Verify all files are in correct locations
- Check browser console for CSP errors

#### FFmpeg Loading Issues
- Verify assets are in public/assets/ffmpeg/
- Check COEP/COOP headers in web app
- Ensure proper file paths in configuration

### API Issues

#### "API Key Invalid" Errors
- Verify GEMINI_API_KEY is set correctly
- Check API key permissions in Google Cloud Console
- Ensure API key is not expired

#### CORS Errors
- Verify server CORS configuration
- Check origin headers in requests
- Ensure proper preflight handling

### Build Issues

#### TypeScript Compilation Errors
```bash
# Check TypeScript configuration
npm run compile
```

#### WXT Build Failures
```bash
# Clean WXT cache
rm -rf .wxt
npm run dev
```

## Development Tools & Helpers

### Browser Extensions for Development
- **React Developer Tools**: Component inspection
- **Redux DevTools**: State management debugging
- **Web Developer**: Various web development utilities

### VS Code Extensions
- **WXT.dev**: Extension framework support
- **TypeScript Importer**: Auto-import management
- **Bracket Pair Colorizer**: Code readability
- **GitLens**: Git integration enhancement

### Useful Scripts

#### Quick Development Setup
```bash
# Create setup script (setup-dev.ps1)
cd alt-text-server
Start-Process npm -ArgumentList "run", "dev" -NoNewWindow

cd alt-text-ext  
Start-Process npm -ArgumentList "run", "dev:chrome" -NoNewWindow

cd alt-text-web
Start-Process npm -ArgumentList "start" -NoNewWindow
```

#### Build All Components
```bash
# build-all.ps1
cd alt-text-ext
npm run build:unified

cd alt-text-server
# No build needed - Node.js runtime

cd alt-text-web
# No build needed - static files
```

---

*Development Guide Version: 1.0 | Last Updated: January 2025*