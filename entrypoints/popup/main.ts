import './style.css';
import browser from 'webextension-polyfill';

// Regular DOM manipulation without using define functions
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div>
      <div class="app-icon-container">
        <img src="/icons/gen-alt-text.svg" alt="Extension Icon" width="48" height="48">
      </div>
      <h1>Bluesky Alt Text Generator</h1>
      <div class="description">
        Automatically generate detailed, accessible alt text for your Bluesky images & videos using Google Gemini AI.
      </div>
      
      <div class="info-section">
        <h2>How it Works</h2>
        <p>
          This extension automatically adds a "generate alt text" button next to alt text input fields on bsky.app
        </p>
      </div>
      
      <div class="buttons">
        <a href="https://github.com/dylanjcastillo/gen-alt-text" target="_blank" class="github-link">
          <img src="/icons/github.svg" alt="GitHub" width="24" height="24">
          GitHub
        </a>
      </div>
    </div>
  `;
});
