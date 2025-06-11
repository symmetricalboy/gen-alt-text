#!/usr/bin/env python3
"""
Simple HTTP server with CORS headers that serves from the 'public' directory.
"""
import http.server
import socketserver
import os

class PublicDirRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='public', **kwargs)

    def guess_type(self, path):
        # Add common MIME types for web development
        if path.endswith(".js"):
            return "application/javascript"
        elif path.endswith(".css"):
            return "text/css"
        elif path.endswith(".json"):
            return "application/json"
        elif path.endswith(".wasm"):
            return "application/wasm"
        return super().guess_type(path)

    def end_headers(self):
        # Required headers for SharedArrayBuffer
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        
        # Additional CORS headers for local development
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    PORT = 8000
    
    print(f"Starting CORS-enabled HTTP server on port {PORT}")
    print("Serving files from the 'public' directory.")
    print(f"SharedArrayBuffer headers enabled for FFmpeg")
    print(f"Access your test at: http://localhost:{PORT}/test-chunking.html")
    print("Press Ctrl+C to stop the server")
    
    with socketserver.TCPServer(("", PORT), PublicDirRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped") 