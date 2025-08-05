// Load environment variables from .env file
require('dotenv').config();

// Express server wrapper for Railway deployment
const express = require('express');
const path =require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Set up COOP/COEP headers for SharedArrayBuffer support (needed for FFmpeg)
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Middleware
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'alt-text-web' });
});

// All other GET requests not handled before will return our application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Alt Text Web App Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 