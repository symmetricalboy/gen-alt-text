var bskyaltgenerator=function(){"use strict";var j=Object.defineProperty;var J=(S,v,A)=>v in S?j(S,v,{enumerable:!0,configurable:!0,writable:!0,value:A}):S[v]=A;var x=(S,v,A)=>J(S,typeof v!="symbol"?v+"":v,A);var B,U;function S(c){return c}const v={matches:["*://*.bsky.app/*"],main(){if(console.log("Bluesky Alt Text Generator loaded"),typeof window>"u"||typeof document>"u")return;const i=['textarea[aria-label="Alt text"]','textarea[placeholder*="alt"]','textarea[placeholder*="Alt"]','textarea[data-testid*="alt"]','[role="textbox"][aria-label*="alt" i]'].join(","),s="gemini-alt-text-button",u='[data-testid="composer"]',h=`${u} input[type="file"][aria-label*="media" i]`,y=u;let f={autoMode:!1,showToasts:!0};const b={storage:{sync:{get:(n,t)=>{var a;try{(a=chrome==null?void 0:chrome.storage)!=null&&a.sync?chrome.storage.sync.get(n,t):(console.warn("Chrome storage API not available, using default values"),t({}))}catch(o){console.error("Error accessing chrome.storage.sync.get:",o),t({})}},set:n=>{var t;try{(t=chrome==null?void 0:chrome.storage)!=null&&t.sync?chrome.storage.sync.set(n):console.warn("Chrome storage API not available, cannot save settings")}catch(a){console.error("Error accessing chrome.storage.sync.set:",a)}}}},runtime:{connect:n=>{var t;try{if((t=chrome==null?void 0:chrome.runtime)!=null&&t.connect)return chrome.runtime.connect(n);throw console.error("Chrome runtime API not available"),new Error("Chrome runtime API not available")}catch(a){throw console.error("Error connecting to background script:",a),a}},onChanged:{addListener:n=>{var t;try{(t=chrome==null?void 0:chrome.storage)!=null&&t.onChanged?chrome.storage.onChanged.addListener(n):console.warn("Chrome storage.onChanged API not available")}catch(a){console.error("Error adding onChanged listener:",a)}}}}};b.storage.sync.get(["autoMode","showToasts"],n=>{n.autoMode!==void 0&&(f.autoMode=n.autoMode),n.showToasts!==void 0&&(f.showToasts=n.showToasts),console.log("Loaded config:",f)}),b.runtime.onChanged.addListener(n=>{n.autoMode&&(f.autoMode=n.autoMode.newValue),n.showToasts&&(f.showToasts=n.showToasts.newValue),console.log("Updated config:",f)});const _=n=>{if(!(!n||n.length===0)){console.log(`Intercepted ${n.length} file(s)`);for(const t of n){if(!t.type.startsWith("image/")&&!t.type.startsWith("video/")){console.log(`Skipping non-media file: ${t.name} (${t.type})`);continue}const a=new FileReader;a.onload=o=>{var e;const r=(e=o.target)==null?void 0:e.result;if(typeof r=="string"){console.log(`Read file ${t.name} (${t.type}), sending to background...`);try{const m=typeof b<"u"&&b.runtime?b.runtime:chrome==null?void 0:chrome.runtime;m!=null&&m.sendMessage?(m.sendMessage({type:"MEDIA_INTERCEPTED",payload:{filename:t.name,filetype:t.type,dataUrl:r,size:t.size}}),f.showToasts&&O(`Captured ${t.name}`,"info",2e3)):console.error("Cannot send message: chrome.runtime.sendMessage not available.")}catch(m){console.error("Error sending message to background script:",m)}}else console.error(`Failed to read file ${t.name} as Base64 Data URL.`)},a.onerror=o=>{console.error(`Error reading file ${t.name}:`,o)},a.readAsDataURL(t)}}},O=(n,t="info",a=5e3)=>{let o=document.getElementById("gemini-toast-container");o||(o=document.createElement("div"),o.id="gemini-toast-container",o.style.position="fixed",o.style.bottom="20px",o.style.right="20px",o.style.zIndex="10000",o.style.display="flex",o.style.flexDirection="column",o.style.gap="10px",document.body.appendChild(o));const r=document.createElement("div");r.style.padding="12px 16px",r.style.borderRadius="6px",r.style.boxShadow="0 2px 8px rgba(0, 0, 0, 0.15)",r.style.margin="5px",r.style.minWidth="200px",r.style.color="#ffffff",r.style.fontSize="14px",r.style.transition="all 0.3s ease",t==="success"?r.style.backgroundColor="#1da882":t==="error"?r.style.backgroundColor="#e53935":t==="warning"?r.style.backgroundColor="#f59f0b":r.style.backgroundColor="#007eda",r.textContent=n;const e=document.createElement("span");e.textContent="×",e.style.marginLeft="8px",e.style.cursor="pointer",e.style.float="right",e.style.fontWeight="bold",e.onclick=()=>{o.removeChild(r)},r.appendChild(e),o.appendChild(r),setTimeout(()=>{o.contains(r)&&o.removeChild(r)},a)},Y=n=>{var m;console.log("Searching for media in container:",n);const t=n.querySelector('[data-testid="imagePreview"] img[src^="data:image/"], [data-testid="images"] img[src^="data:image/"]');if(t){console.log("Found image via SPECIFIC data URL selector:",t);const l=t.getBoundingClientRect();if(l.width>10&&l.height>10&&t.offsetParent!==null)return console.log("Specific data URL image is valid, returning it."),t;console.warn("Specific data URL image found but seems hidden/too small. Rect:",l,"OffsetParent:",t.offsetParent)}else console.log('Did not find image via SPECIFIC data URL selector (e.g., [data-testid="imagePreview"] img[src^="data:image/"]).');const a=n.querySelector('img[src^="data:image/"]');if(a){console.log("Found image via ANY data URL selector:",a);const l=a.getBoundingClientRect();if(l.width>10&&l.height>10&&a.offsetParent!==null)return console.log("ANY data URL image is valid, returning it."),a;console.warn("ANY data URL image found but seems hidden/too small. Rect:",l,"OffsetParent:",a.offsetParent)}else console.log("Did not find image via ANY data URL selector.");console.log("No valid data URL image found, proceeding to scoring logic...");const o=Array.from(n.querySelectorAll("img, video"));console.log(`Found ${o.length} candidates for scoring.`);let r=null,e=-1;for(const l of o){let g=0;const p=l.getBoundingClientRect();if(!(p.width===0||p.height===0||l.offsetParent===null)){if(l.tagName==="VIDEO")if((m=l.src)!=null&&m.startsWith("data:video/")||l.src||l.querySelector("source[src]"))console.log("Found video candidate:",l),g=1e3;else continue;else{const d=l,C=d.src||"",T=d.alt||"";if(!C||C.startsWith("data:")||T.toLowerCase().includes("avatar")||C.includes("avatar")||C.includes("profile"))continue;const E=50;if(p.width<E||p.height<E)continue;g=1,console.log(`Valid image candidate found: ${p.width}x${p.height}`,d),d.closest('[data-testid="imagePreview"], .r-1p0dtai[style*="aspect-ratio"]')&&(console.log("Image is inside a high-priority preview wrapper, boosting score significantly."),g+=500),g<=1&&d.matches('[data-testid*="image"], [data-testid*="preview"], [role="img"]')&&(console.log("Image has a relevant test ID/role, boosting score."),g+=50);const G=d.closest('[data-testid="postView"], [role="article"]'),V=n.closest('[data-testid="postView"], [role="article"]');G&&V&&G!==V&&(console.log("Image seems to be inside a *different* post structure, penalizing score."),g=Math.max(0,g-100)),g+=Math.min(5,Math.floor(p.width/100))}console.log("Candidate score:",g,l),g>e&&(e=g,r=l,console.log("New best candidate selected with score:",e,r))}}return r?console.log("Final selected best candidate (from scoring):",r):(console.error("Failed to find a suitable media candidate within the container after scoring (Highest score <= 0)."),console.error("SCORING FAILED: No suitable media candidate found via scoring logic.")),r};function M(n){if(console.log("[addGenerateButton] Starting for textarea:",n),n.dataset.geminiButtonAdded==="true"){console.log("[addGenerateButton] Button already added, skipping.");return}const t=n.parentElement;let a;const o=t==null?void 0:t.parentElement;if(o)console.log("[addGenerateButton] Found sharedParentContainer:",o),a=o;else{console.error("[addGenerateButton] Could not find expected sharedParentContainer (parent of textarea's parent). Cannot proceed.");const d=X(n);if(!d){console.error("[addGenerateButton] Fallback container finder also failed.");return}console.warn("[addGenerateButton] Using fallback container:",d),a=d}if(a.querySelector(`#${s}`)){console.log("[addGenerateButton] Button already exists in this container, skipping.");return}const r=document.createElement("div");r.style.display="flex",r.style.alignItems="center",r.style.gap="8px",r.style.marginLeft="8px";const e=document.createElement("button");e.id=s,e.title="Generate Alt Text",e.innerHTML=`
        <svg width="20" height="20" viewBox="-5 -10 128 128" xmlns="http://www.w3.org/2000/svg">
          <path d="M 35.746,4 C 20.973,4 9,15.973 9,30.746 V 77.254 C 9,92.027 20.973,104 35.746,104 H 82.254 C 97.027,104 109,92.027 109,77.254 V 30.746 C 109,15.973 97.027,4 82.254,4 Z m -19.77,26.746 c 0,-10.918 8.8516,-19.77 19.77,-19.77 h 46.508 c 10.918,0 19.77,8.8516 19.77,19.77 v 46.508 c 0,10.918 -8.8516,19.77 -19.77,19.77 H 35.746 c -10.918,0 -19.77,-8.8516 -19.77,-19.77 z m 45.609,0.37891 c -1.082,-2.1055 -4.0898,-2.1055 -5.1719,0 l -4.3242,8.4219 c -1.668,3.2383 -4.3047,5.875 -7.543,7.543 l -8.4219,4.3242 c -2.1055,1.082 -2.1055,4.0898 0,5.1719 l 8.4219,4.3242 c 3.2383,1.668 5.875,4.3047 7.543,7.543 l 4.3242,8.4219 c 1.082,2.1055 4.0898,2.1055 5.1719,0 l 4.3242,-8.4219 c 1.668,-3.2383 4.3047,-5.875 7.543,-7.543 l 8.4219,-4.3242 c 2.1055,-1.082 2.1055,-4.0898 0,-5.1719 l -8.4219,-4.3242 c -3.2383,-1.668 -5.875,-4.3047 -7.543,-7.543 z"
             fill="#323248" stroke="none" />
        </svg>
      `,e.style.marginLeft="8px",e.style.padding="4px",e.style.cursor="pointer",e.style.border="1px solid #ccc",e.style.borderRadius="4px",e.style.backgroundColor="#f0f0f0",e.style.display="flex",e.style.alignItems="center",e.style.justifyContent="center",e.style.setProperty("visibility","visible","important"),e.style.setProperty("z-index","9999","important"),e.style.setProperty("position","relative","important");const m=e.innerHTML,l=document.createElement("label");l.className="gemini-auto-toggle",l.title="Auto-generate alt text when media is added",l.style.display="flex",l.style.alignItems="center",l.style.fontSize="12px",l.style.cursor="pointer";const g=document.createElement("input");g.type="checkbox",g.style.margin="0 4px 0 0",g.checked=f.autoMode,g.addEventListener("change",d=>{f.autoMode=d.target.checked,b.storage.sync.set({autoMode:f.autoMode})}),l.appendChild(g),l.appendChild(document.createTextNode("Auto")),r.appendChild(e),r.appendChild(l);const p=async()=>{e.innerHTML="",e.textContent="Connecting...",e.disabled=!0;const d=Y(a);if(console.log("[generateAltText] Media element found within container:",d),!d||!d.src){console.error("[generateAltText] Could not find media element or its src within the designated container."),e.textContent="Error: No Media Found",setTimeout(()=>{e.textContent="",e.innerHTML=m,e.disabled=!1},2e3);return}const C=d.src,T=d.tagName.toLowerCase()==="video";console.log(`[generateAltText] ${T?"Video":"Image"} URL:`,C);try{console.log("[generateAltText] Establishing connection to background script...");const E=b.runtime.connect({name:"altTextGenerator"});console.log("[generateAltText] Connection established."),e.textContent="Generating...",E.onMessage.addListener(w=>{console.log("[generateAltText] Message received from background via port:",w),w.altText?(n.value=w.altText,n.dispatchEvent(new Event("input",{bubbles:!0,cancelable:!0})),console.log("[generateAltText] Alt text inserted."),e.textContent="✓ Done",f.showToasts&&O("Alt text generated! Please review for accuracy before posting.","success"),setTimeout(()=>{e.textContent="",e.innerHTML=m,e.disabled=!1},1500)):w.error?(console.error("[generateAltText] Error generating alt text:",w.error),e.textContent=`Error: ${w.error.substring(0,20)}...`,f.showToasts&&O(`Error: ${w.error}`,"error"),setTimeout(()=>{e.textContent="",e.innerHTML=m,e.disabled=!1},3e3)):(console.error("[generateAltText] Received unexpected message format from background:",w),e.textContent="Msg Format Error",setTimeout(()=>{e.textContent="",e.innerHTML=m,e.disabled=!1},2e3)),E.disconnect()}),E.onDisconnect.addListener(()=>{console.error("[generateAltText] Background port disconnected unexpectedly.",chrome.runtime.lastError||"(No error info)"),!e.textContent.includes("Done")&&!e.textContent.includes("Error")&&(e.textContent="Disconnect Error",setTimeout(()=>{e.textContent="",e.innerHTML=m,e.disabled=!1},3e3))}),console.log("[generateAltText] Sending message via port..."),E.postMessage({action:"generateAltText",imageUrl:C,isVideo:T}),console.log("[generateAltText] Message sent via port.")}catch(E){console.error("[generateAltText] Error establishing connection or posting initial message:",E),e.textContent="Connect Error",setTimeout(()=>{e.textContent="",e.innerHTML=m,e.disabled=!1},2e3)}};e.onclick=async d=>{d.preventDefault(),d.stopPropagation(),console.log("[addGenerateButton] Generate Alt Text button clicked"),await p()},t?(console.log("[addGenerateButton] Attempting to append button container to textAreaContainer:",t),t.appendChild(r)):console.error("[addGenerateButton] Could not find textAreaContainer to append button to."),n.dataset.geminiButtonAdded="true",console.log("[addGenerateButton] Button insertion attempted.")}function X(n){var p;console.log("[findComposerContainer] Starting search for element:",n);const t=n.closest('[role="dialog"][aria-modal="true"]');if(t){if(console.log("[findComposerContainer] Found potential modal dialog:",t),t.contains(n)&&(t.querySelector('[data-testid="imagePreview"]')||t.querySelector('[data-testid="images"]')||t.querySelector('button[aria-label*="Post"], button[type="submit"]')))return console.log("[findComposerContainer] Returning: Priority 1 - Valid Modal Dialog"),t;console.warn("[findComposerContainer] Modal dialog found, but validation failed. Continuing search...")}else console.log("[findComposerContainer] Priority 1: No modal dialog found.");const a=n.closest('[data-testid="composer"]');if(a){if(console.log('[findComposerContainer] Found potential data-testid="composer":',a),a.contains(n)&&(a.querySelector('[data-testid="imagePreview"]')||a.querySelector('[data-testid="images"]')||a.querySelector('button[aria-label*="Post"], button[type="submit"]')))return console.log("[findComposerContainer] Returning: Priority 2 - Valid Test ID Composer"),a;console.warn("[findComposerContainer] Test ID composer found, but validation failed. Continuing search...")}else console.log('[findComposerContainer] Priority 2: No data-testid="composer" found.');console.log("[findComposerContainer] Entering Priority 3: Strict Lowest Common Ancestor search...");let o=n.parentElement,r=10,e=null;const m='[data-testid="imagePreview"] img:not([alt*="avatar"]), [data-testid="images"] img:not([alt*="avatar"])',l='button[aria-label*="Post"], button[type="submit"], button[aria-label*="Cancel"], button[aria-label*="Close"]';for(;o&&o.tagName!=="BODY"&&r>0;){if(o.contains(n)&&o.querySelector(m)&&o.querySelector(l)){console.log("[findComposerContainer] Found potential common ancestor:",o),e=o;const d=o.parentElement;if(!d||d.tagName==="BODY"||!d.contains(n)||!d.querySelector(m)||!d.querySelector(l)){console.log("[findComposerContainer] Parent validation failed, selecting current as lowest common ancestor:",e);break}}r--,o=o.parentElement}if(e)return console.log("[findComposerContainer] Returning: Priority 3 - Lowest Common Ancestor"),e;console.log("[findComposerContainer] Priority 3: No suitable common ancestor found.");const g=t||a||((p=n.parentElement)==null?void 0:p.parentElement)||n.parentElement;return console.error("[findComposerContainer] Returning: Last Resort Fallback:",g),g}const Z=()=>{new MutationObserver(t=>{for(const a of t)a.type==="childList"&&a.addedNodes.forEach(o=>{var r;if(o.nodeType===Node.ELEMENT_NODE){const e=o;if((e.tagName==="IMG"||e.tagName==="VIDEO")&&!((r=e.getAttribute("alt"))!=null&&r.includes("avatar"))&&(console.log("Media element detected:",e),f.autoMode)){const m=e.closest('[data-testid="composer"], [role="dialog"], .css-175oi2r');m&&setTimeout(()=>{const l=m.querySelector(i);if(l){M(l);const g=m.querySelector(`#${s}`);g&&!g.disabled&&(console.log("Auto-generating alt text for newly added media"),g.click())}else{console.log("No alt text field found for auto-generation");const g=new MutationObserver(p=>{for(const d of p)if(d.type==="childList"){const C=m.querySelector(i);if(C){M(C);const T=m.querySelector(`#${s}`);T&&!T.disabled&&(console.log("Alt text field found after waiting, auto-generating"),T.click(),g.disconnect())}}});g.observe(m,{childList:!0,subtree:!0}),setTimeout(()=>g.disconnect(),5e3)}},500)}}})}).observe(document.body,{childList:!0,subtree:!0})};document.querySelectorAll(i).forEach(n=>{M(n)}),new MutationObserver(n=>{console.log("MutationObserver callback triggered.");for(const t of n)t.type==="childList"&&t.addedNodes.forEach(a=>{if(a.nodeType===Node.ELEMENT_NODE){const o=a;o.matches&&o.matches(i)?(console.log("Observer found matching textarea directly:",o),M(o)):o.querySelectorAll&&o.querySelectorAll(i).forEach(r=>{console.log("Observer found matching textarea within added node:",r),M(r)})}})}).observe(document.body,{childList:!0,subtree:!0}),Z();const q=n=>{console.log("Attempting to attach media listeners to:",n);const t=n.querySelector(h),a=n.querySelector(y)||n;t&&!t.dataset.mediaListenerAttached?(console.log("Attaching CHANGE listener to file input:",t),t.addEventListener("change",o=>{var r;console.log("File input CHANGED"),_((r=o.target)==null?void 0:r.files)}),t.dataset.mediaListenerAttached="true"):t?console.log("Change listener already attached to file input."):console.warn("Could not find file input with selector:",h,"within",n),a&&!a.dataset.dropListenerAttached?(console.log("Attaching DROP/DRAGOVER listeners to drop zone:",a),a.addEventListener("dragover",o=>{o.preventDefault(),o.stopPropagation()}),a.addEventListener("drop",o=>{var r;console.log("DROP event detected"),o.preventDefault(),o.stopPropagation(),(r=o.dataTransfer)!=null&&r.files?_(o.dataTransfer.files):console.log("No files found in dataTransfer.")}),a.dataset.dropListenerAttached="true"):a?console.log("Drop/Dragover listeners already attached to drop zone."):console.warn("Could not find drop zone with selector:",y)},$=()=>{console.log("Setting up observer for composer elements"),new MutationObserver(t=>{for(const a of t)a.type==="childList"&&a.addedNodes.forEach(o=>{if(o.nodeType===Node.ELEMENT_NODE){const r=o;r.matches(u)&&(console.log("Composer element added directly:",r),q(r)),r.querySelectorAll(u).forEach(e=>{console.log("Found composer element via querySelectorAll:",e),q(e)})}})}).observe(document.body,{childList:!0,subtree:!0}),console.log("MutationObserver started for composer."),document.querySelectorAll(u).forEach(t=>{console.log("Found existing composer on load:",t),q(t)})};document.readyState==="complete"||document.readyState==="interactive"?$():document.addEventListener("DOMContentLoaded",$)}},I=(U=(B=globalThis.browser)==null?void 0:B.runtime)!=null&&U.id?globalThis.browser:globalThis.chrome;function P(c,...i){}const H={debug:(...c)=>P(console.debug,...c),log:(...c)=>P(console.log,...c),warn:(...c)=>P(console.warn,...c),error:(...c)=>P(console.error,...c)},R=class R extends Event{constructor(i,s){super(R.EVENT_NAME,{}),this.newUrl=i,this.oldUrl=s}};x(R,"EVENT_NAME",k("wxt:locationchange"));let D=R;function k(c){var i;return`${(i=I==null?void 0:I.runtime)==null?void 0:i.id}:bsky_alt_generator:${c}`}function z(c){let i,s;return{run(){i==null&&(s=new URL(location.href),i=c.setInterval(()=>{let u=new URL(location.href);u.href!==s.href&&(window.dispatchEvent(new D(u,s)),s=u)},1e3))}}}const L=class L{constructor(i,s){x(this,"isTopFrame",window.self===window.top);x(this,"abortController");x(this,"locationWatcher",z(this));x(this,"receivedMessageIds",new Set);this.contentScriptName=i,this.options=s,this.abortController=new AbortController,this.isTopFrame?(this.listenForNewerScripts({ignoreFirstEvent:!0}),this.stopOldScripts()):this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(i){return this.abortController.abort(i)}get isInvalid(){return I.runtime.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(i){return this.signal.addEventListener("abort",i),()=>this.signal.removeEventListener("abort",i)}block(){return new Promise(()=>{})}setInterval(i,s){const u=setInterval(()=>{this.isValid&&i()},s);return this.onInvalidated(()=>clearInterval(u)),u}setTimeout(i,s){const u=setTimeout(()=>{this.isValid&&i()},s);return this.onInvalidated(()=>clearTimeout(u)),u}requestAnimationFrame(i){const s=requestAnimationFrame((...u)=>{this.isValid&&i(...u)});return this.onInvalidated(()=>cancelAnimationFrame(s)),s}requestIdleCallback(i,s){const u=requestIdleCallback((...h)=>{this.signal.aborted||i(...h)},s);return this.onInvalidated(()=>cancelIdleCallback(u)),u}addEventListener(i,s,u,h){var y;s==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),(y=i.addEventListener)==null||y.call(i,s.startsWith("wxt:")?k(s):s,u,{...h,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),H.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){window.postMessage({type:L.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:Math.random().toString(36).slice(2)},"*")}verifyScriptStartedEvent(i){var y,f,b;const s=((y=i.data)==null?void 0:y.type)===L.SCRIPT_STARTED_MESSAGE_TYPE,u=((f=i.data)==null?void 0:f.contentScriptName)===this.contentScriptName,h=!this.receivedMessageIds.has((b=i.data)==null?void 0:b.messageId);return s&&u&&h}listenForNewerScripts(i){let s=!0;const u=h=>{if(this.verifyScriptStartedEvent(h)){this.receivedMessageIds.add(h.data.messageId);const y=s;if(s=!1,y&&(i!=null&&i.ignoreFirstEvent))return;this.notifyInvalidated()}};addEventListener("message",u),this.onInvalidated(()=>removeEventListener("message",u))}};x(L,"SCRIPT_STARTED_MESSAGE_TYPE",k("wxt:content-script-started"));let F=L;function K(){}function N(c,...i){}const W={debug:(...c)=>N(console.debug,...c),log:(...c)=>N(console.log,...c),warn:(...c)=>N(console.warn,...c),error:(...c)=>N(console.error,...c)};return(async()=>{try{const{main:c,...i}=v,s=new F("bsky_alt_generator",i);return await c(s)}catch(c){throw W.error('The content script "bsky_alt_generator" crashed on startup!',c),c}})()}();
bskyaltgenerator;
