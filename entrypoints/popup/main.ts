import './style.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <div class="app-icon-container">
      <img src="/icon/gen-alt-text.svg" alt="Extension Icon" width="48" height="48">
    </div>
    <h1>Bluesky Alt Text Generator</h1>
    <div class="description">
      Automatically generate detailed, accessible alt text for your Bluesky images using Google Gemini AI.
    </div>
    
    <div class="options-section">
      <h2>Options</h2>
      
      <div class="option-row">
        <label class="toggle-switch">
          <input type="checkbox" id="autoMode">
          <span class="toggle-slider"></span>
        </label>
        <div class="option-text">
          <h3>Auto-generate mode</h3>
          <p>Automatically generate alt text when images or videos are added</p>
        </div>
      </div>
      
      <div class="option-row">
        <label class="toggle-switch">
          <input type="checkbox" id="showToasts" checked>
          <span class="toggle-slider"></span>
        </label>
        <div class="option-text">
          <h3>Show notifications</h3>
          <p>Display reminders to check generated text before posting</p>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>
        Feedback, suggestions, assistance, & updates at 
        <a href="https://bsky.app/profile/symm.app" target="_blank" rel="noopener noreferrer">@symm.app</a>
      </p>
      <p>Free & <a href="https://github.com/symmetricalboy/gen-alt-text" target="_blank" rel="noopener noreferrer">open source</a>, for all, forever.</p>
      <p class="copyright">Copyright © 2025 Dylan Gregori Singer (symmetricalboy)</p>
    </div>
  </div>
`;

// Helper function to safely access chrome APIs
const safeChrome = {
  storage: {
    sync: {
      get: (keys, callback) => {
        try {
          if (chrome?.storage?.sync) {
            chrome.storage.sync.get(keys, callback);
          } else {
            console.warn('Chrome storage API not available, using default values');
            callback({});
          }
        } catch (error) {
          console.error('Error accessing chrome.storage.sync.get:', error);
          callback({});
        }
      },
      set: (items) => {
        try {
          if (chrome?.storage?.sync) {
            chrome.storage.sync.set(items);
          } else {
            console.warn('Chrome storage API not available, cannot save settings');
          }
        } catch (error) {
          console.error('Error accessing chrome.storage.sync.set:', error);
        }
      }
    }
  }
};

// Load saved options
safeChrome.storage.sync.get(['autoMode', 'showToasts'], (result) => {
  const autoModeToggle = document.getElementById('autoMode') as HTMLInputElement;
  const showToastsToggle = document.getElementById('showToasts') as HTMLInputElement;
  
  // Set initial toggle states
  if (result.autoMode !== undefined) autoModeToggle.checked = result.autoMode;
  if (result.showToasts !== undefined) showToastsToggle.checked = result.showToasts;
  
  // Add change listeners
  autoModeToggle.addEventListener('change', () => {
    safeChrome.storage.sync.set({ autoMode: autoModeToggle.checked });
  });
  
  showToastsToggle.addEventListener('change', () => {
    safeChrome.storage.sync.set({ showToasts: showToastsToggle.checked });
  });
});
