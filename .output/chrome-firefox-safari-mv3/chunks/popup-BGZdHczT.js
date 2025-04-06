(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))c(e);new MutationObserver(e=>{for(const s of e)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&c(i)}).observe(document,{childList:!0,subtree:!0});function r(e){const s={};return e.integrity&&(s.integrity=e.integrity),e.referrerPolicy&&(s.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?s.credentials="include":e.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function c(e){if(e.ep)return;e.ep=!0;const s=r(e);fetch(e.href,s)}})();try{}catch(t){console.error("[wxt] Failed to initialize plugins",t)}document.querySelector("#app").innerHTML=`
  <div>
    <div class="app-icon-container">
      <svg width="48" height="48" viewBox="-5 -10 128 128" xmlns="http://www.w3.org/2000/svg">
        <path d="M 35.746,4 C 20.973,4 9,15.973 9,30.746 V 77.254 C 9,92.027 20.973,104 35.746,104 H 82.254 C 97.027,104 109,92.027 109,77.254 V 30.746 C 109,15.973 97.027,4 82.254,4 Z m -19.77,26.746 c 0,-10.918 8.8516,-19.77 19.77,-19.77 h 46.508 c 10.918,0 19.77,8.8516 19.77,19.77 v 46.508 c 0,10.918 -8.8516,19.77 -19.77,19.77 H 35.746 c -10.918,0 -19.77,-8.8516 -19.77,-19.77 z m 45.609,0.37891 c -1.082,-2.1055 -4.0898,-2.1055 -5.1719,0 l -4.3242,8.4219 c -1.668,3.2383 -4.3047,5.875 -7.543,7.543 l -8.4219,4.3242 c -2.1055,1.082 -2.1055,4.0898 0,5.1719 l 8.4219,4.3242 c 3.2383,1.668 5.875,4.3047 7.543,7.543 l 4.3242,8.4219 c 1.082,2.1055 4.0898,2.1055 5.1719,0 l 4.3242,-8.4219 c 1.668,-3.2383 4.3047,-5.875 7.543,-7.543 l 8.4219,-4.3242 c 2.1055,-1.082 2.1055,-4.0898 0,-5.1719 l -8.4219,-4.3242 c -3.2383,-1.668 -5.875,-4.3047 -7.543,-7.543 z" 
           fill="#323248" stroke="none" />
      </svg>
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
      <p>Free & open source, for all, forever.</p>
      <p class="copyright">Copyright © 2025 Dylan Gregori Singer (symmetricalboy)</p>
    </div>
  </div>
`;const a={storage:{sync:{get:(t,o)=>{var r;try{(r=chrome==null?void 0:chrome.storage)!=null&&r.sync?chrome.storage.sync.get(t,o):(console.warn("Chrome storage API not available, using default values"),o({}))}catch(c){console.error("Error accessing chrome.storage.sync.get:",c),o({})}},set:t=>{var o;try{(o=chrome==null?void 0:chrome.storage)!=null&&o.sync?chrome.storage.sync.set(t):console.warn("Chrome storage API not available, cannot save settings")}catch(r){console.error("Error accessing chrome.storage.sync.set:",r)}}}}};a.storage.sync.get(["autoMode","showToasts"],t=>{const o=document.getElementById("autoMode"),r=document.getElementById("showToasts");t.autoMode!==void 0&&(o.checked=t.autoMode),t.showToasts!==void 0&&(r.checked=t.showToasts),o.addEventListener("change",()=>{a.storage.sync.set({autoMode:o.checked})}),r.addEventListener("change",()=>{a.storage.sync.set({showToasts:r.checked})})});
