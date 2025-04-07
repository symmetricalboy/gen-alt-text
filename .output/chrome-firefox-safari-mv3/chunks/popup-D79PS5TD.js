(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))i(e);new MutationObserver(e=>{for(const s of e)if(s.type==="childList")for(const a of s.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function r(e){const s={};return e.integrity&&(s.integrity=e.integrity),e.referrerPolicy&&(s.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?s.credentials="include":e.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(e){if(e.ep)return;e.ep=!0;const s=r(e);fetch(e.href,s)}})();try{}catch(o){console.error("[wxt] Failed to initialize plugins",o)}document.querySelector("#app").innerHTML=`
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
`;const n={storage:{sync:{get:(o,t)=>{var r;try{(r=chrome==null?void 0:chrome.storage)!=null&&r.sync?chrome.storage.sync.get(o,t):(console.warn("Chrome storage API not available, using default values"),t({}))}catch(i){console.error("Error accessing chrome.storage.sync.get:",i),t({})}},set:o=>{var t;try{(t=chrome==null?void 0:chrome.storage)!=null&&t.sync?chrome.storage.sync.set(o):console.warn("Chrome storage API not available, cannot save settings")}catch(r){console.error("Error accessing chrome.storage.sync.set:",r)}}}}};n.storage.sync.get(["autoMode","showToasts"],o=>{const t=document.getElementById("autoMode"),r=document.getElementById("showToasts");o.autoMode!==void 0&&(t.checked=o.autoMode),o.showToasts!==void 0&&(r.checked=o.showToasts),t.addEventListener("change",()=>{n.storage.sync.set({autoMode:t.checked})}),r.addEventListener("change",()=>{n.storage.sync.set({showToasts:r.checked})})});
