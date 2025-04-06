(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))c(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const r of t.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&c(r)}).observe(document,{childList:!0,subtree:!0});function i(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function c(e){if(e.ep)return;e.ep=!0;const t=i(e);fetch(e.href,t)}})();try{}catch(o){console.error("[wxt] Failed to initialize plugins",o)}document.querySelector("#app").innerHTML=`
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
`;chrome.storage.sync.get(["autoMode","showToasts"],o=>{const s=document.getElementById("autoMode"),i=document.getElementById("showToasts");o.autoMode!==void 0&&(s.checked=o.autoMode),o.showToasts!==void 0&&(i.checked=o.showToasts),s.addEventListener("change",()=>{chrome.storage.sync.set({autoMode:s.checked})}),i.addEventListener("change",()=>{chrome.storage.sync.set({showToasts:i.checked})})});
