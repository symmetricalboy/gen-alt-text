import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <img src="/icon/gen-alt-text.svg" alt="Bluesky Alt Text Generator Icon" class="app-icon" />
    <h1>Bluesky Alt Text Generator</h1>
    <div class="description">
      Automatically generate detailed, accessible alt text for your Bluesky images using Google Gemini AI.
    </div>
    
    <div class="options-section">
      <h2>Options</h2>
      <p>Additional customization options will be available in future updates.</p>
    </div>
    
    <div class="footer">
      <p>
        Feedback, suggestions, assistance, & updates at 
        <a href="https://bsky.app/profile/symm.app" target="_blank" rel="noopener noreferrer">@symm.app</a>
      </p>
      <p>Free & open source, for all, forever.</p>
      <p class="copyright">Copyright © 2025 Dylan Gregori Singer (symmetricalboy)</p>
    </div>
  </div>
`;
