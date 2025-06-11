#!/usr/bin/env python3
"""
Simple HTTP server with CORS headers required for SharedArrayBuffer (FFmpeg)
"""
import http.server
import socketserver
import os
from urllib.parse import unquote

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
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
    print(f"SharedArrayBuffer headers enabled for FFmpeg")
    print(f"Access your test at: http://localhost:{PORT}/test-chunking.html")
    print("Press Ctrl+C to stop the server")
    
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped") 