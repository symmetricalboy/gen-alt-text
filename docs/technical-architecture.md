# Technical Architecture Overview

## System Architecture

The Bluesky Alt Text Generator is built as a distributed system with four main components working together to provide AI-powered alt text generation. The architecture emphasizes modularity, scalability, and cross-platform compatibility.

```mermaid
graph TB
    subgraph "Client Applications"
        EXT[Browser Extension<br/>alt-text-ext]
        WEB[Web Application<br/>alt-text-web]
    end
    
    subgraph "Backend Services"
        API[API Server<br/>alt-text-server]
        GEMINI[Google Gemini AI<br/>@google/genai v1.12.0]
    end
    
    subgraph "Infrastructure"
        RAILWAY[Railway Platform]
        STORES[Browser Stores]
    end
    
    EXT --> API
    WEB --> API
    API --> GEMINI
    API --> RAILWAY
    WEB --> RAILWAY
    EXT --> STORES
    
    classDef client fill:#e1f5fe
    classDef backend fill:#f3e5f5
    classDef infra fill:#e8f5e8
    
    class EXT,WEB client
    class API,GEMINI backend
    class RAILWAY,STORES infra
```

## Component Architecture

### 1. Browser Extension (alt-text-ext)

**Framework**: WXT.dev for cross-browser compatibility  
**Architecture**: Manifest V3 with service worker pattern  
**Version**: 1.0.0 (development), 0.3.1 (published stores)

#### Core Components:
- **Background Service Worker** (`background.ts`): Main controller, API communication
- **Content Scripts** (`bsky_alt_generator.content.ts`): DOM manipulation, UI injection
- **Offscreen Document**: FFmpeg video processing in isolated context
- **Popup Interface**: Extension settings and information

#### Video Processing Pipeline:
```mermaid
graph LR
    A[User Uploads Video] --> B{File Size Check}
    B -->|< 15MB| C[Direct Upload]
    B -->|15-80MB| D[Standard Compression]
    B -->|> 80MB| E[IndexedDB Transfer]
    
    D --> F[FFmpeg Offscreen]
    E --> F
    F --> G[Codec Selection<br/>H.264/VP8/VP9]
    G --> H[Quality Settings<br/>Low/Medium/High]
    H --> I[Compressed Output]
    
    C --> J[API Request]
    I --> J
    J --> K[Gemini Processing]
    K --> L[Alt Text Result]
```

#### Key Technologies:
- **FFmpeg.wasm v0.11.x**: Video compression with multi-codec support
- **IndexedDB**: Large file handling for Chrome message size limits
- **WebExtension Polyfill**: Cross-browser API compatibility
- **TypeScript**: Type-safe development

### 2. Backend Server (alt-text-server)

**Framework**: Express.js  
**Deployment**: Railway Platform  
**AI Integration**: @google/genai v1.12.0 (latest Google GenAI SDK)

#### Architecture Layers:
```mermaid
graph TD
    A[Express Router] --> B[Request Validation]
    B --> C[Content Type Detection]
    C --> D[Instruction Set Selection]
    D --> E[File Size Analysis]
    E --> F{Processing Strategy}
    
    F -->|< 15MB| G[Direct API Call]
    F -->|15-100MB| H[Files API Upload]
    F -->|> 100MB| I[Compression + Files API]
    
    G --> J[Gemini API Request]
    H --> J
    I --> J
    
    J --> K[Response Processing]
    K --> L[Client Response]
```

#### Specialized AI Instruction Sets:
1. **VTT Caption Generation**: WebVTT-formatted video captions
2. **Still Image Alt Text**: Optimized for photographs and static images
3. **Animated Content**: Specialized for GIFs and short animations
4. **Full Video Alt Text**: Comprehensive video descriptions
5. **Video Frame Alt Text**: Single frame analysis with context
6. **Text Condensation**: Length optimization while preserving meaning

#### Advanced Features:
- **Smart Content Detection**: Automatic instruction set selection
- **Files API Integration**: Handles large files efficiently
- **Compression Fallbacks**: Multiple strategies for file size optimization
- **CORS Management**: Secure cross-origin requests
- **Health Monitoring**: Railway deployment health checks

### 3. Web Application (alt-text-web)

**Architecture**: Progressive Web App (PWA)  
**Server**: Express.js with security headers  
**Deployment**: Railway Platform  
**Frontend**: Vanilla JavaScript ES6+ with Web Workers

#### PWA Architecture:
```mermaid
graph TB
    A[Service Worker] --> B[Cache Strategy]
    B --> C[Offline Support]
    
    D[Main App] --> E[File Upload Handler]
    E --> F[Compression Worker]
    F --> G[FFmpeg.wasm v0.11.0]
    
    D --> H[API Communication]
    H --> I[Backend Server]
    
    J[Express Server] --> K[Security Headers<br/>COEP/COOP]
    K --> L[Static File Serving]
    
    classDef pwa fill:#e3f2fd
    classDef worker fill:#f1f8e9
    classDef server fill:#fce4ec
    
    class A,B,C pwa
    class F,G worker
    class J,K,L server
```

#### Core Features:
- **Drag & Drop Interface**: Intuitive file upload
- **Real-time Compression Logs**: User feedback during processing
- **Web Worker Processing**: Non-blocking video compression
- **Cross-Origin Security**: Proper COEP/COOP headers for SharedArrayBuffer
- **Mobile Responsive**: Touch-friendly interface

### 4. Main Repository (gen-alt-text)

**Purpose**: Central coordination and documentation hub  
**Content**: Project assets, documentation, release coordination

## Data Flow Architecture

### 1. Extension Workflow:
```
User Action (Bluesky) → Content Script → Background Service → 
Offscreen Processing → API Request → Gemini Processing → 
Response → UI Update → User Review
```

### 2. Web App Workflow:
```
File Upload → Compression Worker → API Request → 
Gemini Processing → Response → Result Display → Copy to Clipboard
```

### 3. API Processing Pipeline:
```
Request Validation → Content Analysis → Instruction Selection → 
File Size Strategy → Gemini API Call → Response Processing → 
Client Response
```

## Security Architecture

### Authentication & Authorization:
- **API Key Management**: Secure environment variable storage
- **CORS Policy**: Restricted origin access
- **Request Validation**: Input sanitization and validation

### Content Security:
- **CSP Headers**: Strict content security policies
- **File Size Limits**: Graduated limits with compression
- **Rate Limiting**: API request throttling

### Privacy Protection:
- **No Data Persistence**: Temporary processing only
- **Client-side Processing**: Video compression happens locally
- **Secure Transmission**: HTTPS-only communication

## Performance Architecture

### Optimization Strategies:
1. **Client-side Compression**: Reduces bandwidth usage
2. **Adaptive Quality Settings**: Balance quality vs. size
3. **Parallel Processing**: Web Workers prevent UI blocking
4. **Caching Strategies**: PWA caching for offline capability
5. **CDN-free Architecture**: Local asset hosting for reliability

### Scalability Considerations:
- **Stateless Design**: Horizontal scaling capability
- **Railway Auto-scaling**: Platform-level scaling
- **Resource Optimization**: Memory and CPU efficient processing

## Technology Stack Summary

| Component | Primary Tech | Key Libraries | Version |
|-----------|-------------|---------------|---------|
| Extension | TypeScript, WXT | @ffmpeg/ffmpeg v0.11.x | 1.0.0 |
| Backend | Node.js, Express | @google/genai v1.12.0 | 1.0.0 |
| Web App | JavaScript ES6+, PWA | FFmpeg.wasm v0.11.0 | 1.0.0 |
| Deployment | Railway | Express servers | Latest |

## Integration Points

### External APIs:
- **Google Gemini API**: AI processing via @google/genai SDK
- **Railway Platform**: Hosting and deployment
- **Browser Extension Stores**: Chrome Web Store, Firefox Add-ons

### Internal APIs:
- **Unified Backend API**: Single endpoint for all clients
- **WebExtension APIs**: Chrome/Firefox extension capabilities
- **Web APIs**: File API, Web Workers, Service Workers

---

*Architecture Version: 1.0 | Last Updated: January 2025*