(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const o of t.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function n(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function s(e){if(e.ep)return;e.ep=!0;const t=n(e);fetch(e.href,t)}})();try{}catch(i){console.error("[wxt] Failed to initialize plugins",i)}document.querySelector("#app").innerHTML=`
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
`;
