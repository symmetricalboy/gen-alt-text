(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))n(e);new MutationObserver(e=>{for(const r of e)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function s(e){const r={};return e.integrity&&(r.integrity=e.integrity),e.referrerPolicy&&(r.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?r.credentials="include":e.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(e){if(e.ep)return;e.ep=!0;const r=s(e);fetch(e.href,r)}})();try{}catch(o){console.error("[wxt] Failed to initialize plugins",o)}document.querySelector("#app").innerHTML=`
  <div>
    <div class="app-icon-container">
      <img src="/icon/gen-alt-text.svg" alt="Extension Icon" width="48" height="48">
    </div>
    <h1>Bluesky Alt Text Generator</h1>
    <div class="description">
      Automatically generate detailed, accessible alt text for your Bluesky images using Google Gemini AI.
    </div>
    
    <div class="info-section">
      <h2>How it Works</h2>
      <p>
        This extension automatically adds a ✨ button next to alt text input fields on bsky.app. 
        Click the button to generate alt text for the associated image or video.
      </p>
       <p>
        Remember to always review the generated text before posting!
      </p>
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
`;const i={storage:{sync:{get:(o,t)=>{var s;try{(s=chrome==null?void 0:chrome.storage)!=null&&s.sync?chrome.storage.sync.get(o,t):(console.warn("Chrome storage API not available, using default values"),t({}))}catch(n){console.error("Error accessing chrome.storage.sync.get:",n),t({})}},set:o=>{var t;try{(t=chrome==null?void 0:chrome.storage)!=null&&t.sync?chrome.storage.sync.set(o):console.warn("Chrome storage API not available, cannot save settings")}catch(s){console.error("Error accessing chrome.storage.sync.set:",s)}}}}};i.storage.sync.get(["autoMode","showToasts"],o=>{const t=document.getElementById("autoMode"),s=document.getElementById("showToasts");o.autoMode!==void 0&&(t.checked=o.autoMode),o.showToasts!==void 0&&(s.checked=o.showToasts),t.addEventListener("change",()=>{i.storage.sync.set({autoMode:t.checked})}),s.addEventListener("change",()=>{i.storage.sync.set({showToasts:s.checked})})});
