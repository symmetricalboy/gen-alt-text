var bskyaltgenerator=function(){"use strict";var j=Object.defineProperty;var q=(T,h,d)=>h in T?j(T,h,{enumerable:!0,configurable:!0,writable:!0,value:d}):T[h]=d;var x=(T,h,d)=>q(T,typeof h!="symbol"?h+"":h,d);var V,F;function T(i){return i}const d=(F=(V=globalThis.browser)==null?void 0:V.runtime)!=null&&F.id?globalThis.browser:globalThis.chrome,G={matches:["*://*.bsky.app/*"],main(){if(console.log("Bluesky Alt Text Generator loaded"),typeof window>"u"||typeof document>"u")return;const t=['textarea[aria-label="Alt text"]','textarea[placeholder*="alt"]','textarea[placeholder*="Alt"]','textarea[data-testid*="alt"]','[role="textbox"][aria-label*="alt" i]'].join(","),r="gemini-alt-text-button",s=(o,n="info",a=8e3)=>{let l=document.getElementById("gemini-toast-container");l||(l=document.createElement("div"),l.id="gemini-toast-container",Object.assign(l.style,{position:"fixed",bottom:"20px",right:"20px",zIndex:"10000",display:"flex",flexDirection:"column",gap:"10px"}),document.body.appendChild(l));const c=document.createElement("div");Object.assign(c.style,{padding:"12px 16px",borderRadius:"6px",boxShadow:"0 2px 8px rgba(0, 0, 0, 0.15)",margin:"5px",minWidth:"200px",color:"#ffffff",fontSize:"14px",transition:"all 0.3s ease"});const e={success:"#1da882",error:"#e53935",warning:"#f59f0b",info:"#007eda"};c.style.backgroundColor=e[n]||e.info,c.textContent=o;const v=document.createElement("span");v.textContent="×",Object.assign(v.style,{marginLeft:"8px",cursor:"pointer",float:"right",fontWeight:"bold"}),v.onclick=()=>{c.parentNode===l&&l.removeChild(c)},c.appendChild(v),l.appendChild(c),setTimeout(()=>{c.parentNode===l&&l.removeChild(c)},a)},u=o=>{console.log("[findMediaElement - Simplified] Searching for media in container:",o);const n=l=>{if(!l)return!1;const c=l.getBoundingClientRect();return c.width>0&&c.height>0&&l.offsetParent!==null},a=['[data-testid="imagePreview"] img[src]','[data-testid="images"] img[src]','[data-testid="videoPreview"] video[src]','[data-testid="videos"] video[src]','[data-testid="videoPreview"] video source[src]','[data-testid="videos"] video source[src]','img[src]:not([alt*="avatar" i]):not([src*="avatar"])',"video[src]","video source[src]"];for(const l of a){const c=o.querySelector(l);if(c instanceof HTMLSourceElement){const e=c.closest("video");if(e&&n(e))return console.log(`[findMediaElement - Simplified] Found video via source selector: ${l}`,e),e;continue}if(c&&n(c))return console.log(`[findMediaElement - Simplified] Found media via direct selector: ${l}`,c),c}return console.error("[findMediaElement - Simplified] FAILED: No suitable media found using direct selectors."),null},g=o=>{const n=[o.closest('[data-testid="composePostView"]'),o.closest('[role="dialog"][aria-label*="alt text" i]'),o.closest('[aria-label="Video settings"]')];for(const a of n)if(a)return console.log("[findComposerContainer] Found container:",a,"for element:",o),a;return console.warn("[findComposerContainer] Could not find a known composer/dialog container for element:",o),null},M=async o=>{try{if(o instanceof HTMLImageElement){if(o.src.startsWith("data:"))return o.src;if(o.src.startsWith("blob:")){const a=await(await fetch(o.src)).blob();return new Promise((l,c)=>{const e=new FileReader;e.onloadend=()=>l(e.result),e.onerror=c,e.readAsDataURL(a)})}else{console.log("[getMediaAsDataUrl] Attempting canvas fallback for image src:",o.src);const n=document.createElement("canvas");n.width=o.naturalWidth||o.width,n.height=o.naturalHeight||o.height;const a=n.getContext("2d");if(!a)throw new Error("Could not get 2D context");return a.drawImage(o,0,0),n.toDataURL()}}else if(o instanceof HTMLVideoElement){console.log("[getMediaAsDataUrl] Capturing frame from video:",o);const n=document.createElement("canvas");n.width=o.videoWidth,n.height=o.videoHeight;const a=n.getContext("2d");if(!a)throw new Error("Could not get 2D context");return a.drawImage(o,0,0,n.width,n.height),n.toDataURL("image/jpeg")}}catch(n){console.error("[getMediaAsDataUrl] Error converting media to Data URL:",n,o),s("Error processing media. It might be protected or inaccessible.","error")}return null};function b(o){if(o.dataset.geminiButtonAdded==="true")return;console.log("[addGenerateButton] Starting for textarea:",o);const n=g(o);if(!n){console.error("[addGenerateButton] Could not find the context container for the textarea. Button not added.");return}console.log("[addGenerateButton] Found context container for textarea:",n);let a=null;if(n.matches('[aria-label="Video settings"]')){if(console.log('[addGenerateButton] Context is "Video settings", searching document for [data-testid="composePostView"]...'),a=document.querySelector('[data-testid="composePostView"]'),!a){console.error('[addGenerateButton] Context is "Video settings", but failed to find [data-testid="composePostView"] in the document for media search.');return}console.log('[addGenerateButton] Context is "Video settings", found composePostView in document for media search:',a)}else a=n,console.log("[addGenerateButton] Context is composePostView or Add alt text, targeting context container for media search:",a);const l=o.parentElement;if(!l){console.error("[addGenerateButton] Could not find textarea parentElement to attach button or check for existing.");return}if(l.querySelector(`#${r}`)){console.log("[addGenerateButton] Button already exists near the textarea attach point, marking textarea and skipping UI creation."),o.dataset.geminiButtonAdded="true";return}const c=document.createElement("div");Object.assign(c.style,{display:"flex",alignItems:"center",gap:"8px",marginTop:"4px",justifyContent:"flex-end"});const e=document.createElement("button");e.id=r,e.title="Generate Alt Text";const v=d.runtime.getURL("/icon/gen-alt-text.svg");e.innerHTML=`<img src="${v}" alt="Generate Alt Text Icon" width="20" height="20" style="display: block;">`,Object.assign(e.style,{marginLeft:"8px",padding:"4px",cursor:"pointer",border:"1px solid #ccc",borderRadius:"4px",backgroundColor:"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center"}),e.style.setProperty("visibility","visible","important"),e.style.setProperty("z-index","9999","important"),e.style.setProperty("position","relative","important");const E=e.innerHTML,O=async()=>{if(e.innerHTML="",e.textContent="Finding Media...",e.style.color="#000000",e.disabled=!0,!a){console.error("[generateAltText] mediaSearchContainer is null! Cannot search for media."),e.textContent="Error: Internal",e.style.color="#000000",setTimeout(()=>{e.innerHTML=E,e.style.color="",e.disabled=!1},3e3);return}console.log("[generateAltText] Searching for media within determined media search container:",a);const f=u(a);if(console.log("[generateAltText] Media element found in search container:",f),!f||!(f instanceof HTMLImageElement||f instanceof HTMLVideoElement)){console.error("[generateAltText] Could not find valid media element."),e.textContent="Error: No Media",e.style.color="#000000",setTimeout(()=>{e.innerHTML=E,e.style.color="",e.disabled=!1},2e3);return}e.textContent="Processing Media...",e.style.color="#000000";const D=await M(f);if(!D){console.error("[generateAltText] Failed to get media as Data URL."),e.textContent="Error: Process Fail",e.style.color="#000000",setTimeout(()=>{e.innerHTML=E,e.style.color="",e.disabled=!1},3e3);return}const R=f.tagName==="VIDEO";console.log(`[generateAltText] Got ${R?"Video":"Image"} as Data URL (length: ${D.length})`);try{console.log("[generateAltText] Connecting to background..."),e.textContent="Connecting...",e.style.color="#000000";const y=d.runtime.connect({name:"altTextGenerator"});console.log("[generateAltText] Connection established."),e.textContent="Generating...",e.style.color="#000000",y.onMessage.addListener(m=>{console.log("[generateAltText] Msg from background:",m);let p="",U=!1;if(m.altText)o.value=m.altText,o.dispatchEvent(new Event("input",{bubbles:!0,cancelable:!0})),p="✓ Done",s("Alt text generated! 🤖 Double-check it before posting, AI can make mistakes.","success",8e3);else if(m.error){const B=typeof m.error=="string"?m.error:"Unknown error";p=`Error: ${B.substring(0,20)}...`,U=!0,s(`Error: ${B}`,"error")}else p="Msg Format Err",U=!0,console.error("[generateAltText] Unexpected message format:",m);e.textContent=p,e.style.color="#000000",setTimeout(()=>{e.innerHTML=E,e.style.color="",e.disabled=!1},U?3e3:1500);try{y.disconnect()}catch{}}),y.onDisconnect.addListener(()=>{const m=d.runtime.lastError;console.error("[generateAltText] Port disconnected.",m||"(No error info)");const p=e.textContent;p&&!p.includes("Done")&&!p.includes("Error")&&(e.textContent="Disconnect Err",e.style.color="#000000",setTimeout(()=>{e.innerHTML=E,e.style.color="",e.disabled=!1},3e3))}),console.log("[generateAltText] Sending message..."),y.postMessage({action:"generateAltText",imageUrl:D,isVideo:R}),console.log("[generateAltText] Message sent.")}catch(y){console.error("[generateAltText] Connect/Post error:",y),e.textContent="Connect Error",e.style.color="#000000",setTimeout(()=>{e.innerHTML=E,e.style.color="",e.disabled=!1},2e3)}};e.addEventListener("click",f=>{f.preventDefault(),f.stopPropagation(),O()}),l.appendChild(c),o.dataset.geminiButtonAdded="true",console.log("[addGenerateButton] Button added successfully inside parent:",l)}let L=null;const N=()=>{L&&L.disconnect(),console.log("[observeAltTextAreas] Starting observer for manual button injection."),document.querySelectorAll(t).forEach(b),L=new MutationObserver(o=>{for(const n of o)n.type==="childList"&&n.addedNodes.forEach(a=>{a instanceof HTMLElement&&(a.matches(t)&&b(a),a.querySelectorAll(t).forEach(b))}),n.type==="attributes"&&n.target instanceof HTMLElement&&n.target.matches(t)&&b(n.target)}),L.observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["aria-label","placeholder","data-testid","role"]}),console.log("[observeAltTextAreas] Observer attached to document body.")};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",N):N(),console.log("Bluesky Alt Text Generator content script setup complete.")}};function C(i,...t){}const _={debug:(...i)=>C(console.debug,...i),log:(...i)=>C(console.log,...i),warn:(...i)=>C(console.warn,...i),error:(...i)=>C(console.error,...i)},S=class S extends Event{constructor(t,r){super(S.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=r}};x(S,"EVENT_NAME",P("wxt:locationchange"));let I=S;function P(i){var t;return`${(t=d==null?void 0:d.runtime)==null?void 0:t.id}:bsky_alt_generator:${i}`}function H(i){let t,r;return{run(){t==null&&(r=new URL(location.href),t=i.setInterval(()=>{let s=new URL(location.href);s.href!==r.href&&(window.dispatchEvent(new I(s,r)),r=s)},1e3))}}}const w=class w{constructor(t,r){x(this,"isTopFrame",window.self===window.top);x(this,"abortController");x(this,"locationWatcher",H(this));x(this,"receivedMessageIds",new Set);this.contentScriptName=t,this.options=r,this.abortController=new AbortController,this.isTopFrame?(this.listenForNewerScripts({ignoreFirstEvent:!0}),this.stopOldScripts()):this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return d.runtime.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,r){const s=setInterval(()=>{this.isValid&&t()},r);return this.onInvalidated(()=>clearInterval(s)),s}setTimeout(t,r){const s=setTimeout(()=>{this.isValid&&t()},r);return this.onInvalidated(()=>clearTimeout(s)),s}requestAnimationFrame(t){const r=requestAnimationFrame((...s)=>{this.isValid&&t(...s)});return this.onInvalidated(()=>cancelAnimationFrame(r)),r}requestIdleCallback(t,r){const s=requestIdleCallback((...u)=>{this.signal.aborted||t(...u)},r);return this.onInvalidated(()=>cancelIdleCallback(s)),s}addEventListener(t,r,s,u){var g;r==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),(g=t.addEventListener)==null||g.call(t,r.startsWith("wxt:")?P(r):r,s,{...u,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),_.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){window.postMessage({type:w.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:Math.random().toString(36).slice(2)},"*")}verifyScriptStartedEvent(t){var g,M,b;const r=((g=t.data)==null?void 0:g.type)===w.SCRIPT_STARTED_MESSAGE_TYPE,s=((M=t.data)==null?void 0:M.contentScriptName)===this.contentScriptName,u=!this.receivedMessageIds.has((b=t.data)==null?void 0:b.messageId);return r&&s&&u}listenForNewerScripts(t){let r=!0;const s=u=>{if(this.verifyScriptStartedEvent(u)){this.receivedMessageIds.add(u.data.messageId);const g=r;if(r=!1,g&&(t!=null&&t.ignoreFirstEvent))return;this.notifyInvalidated()}};addEventListener("message",s),this.onInvalidated(()=>removeEventListener("message",s))}};x(w,"SCRIPT_STARTED_MESSAGE_TYPE",P("wxt:content-script-started"));let k=w;function W(){}function A(i,...t){}const $={debug:(...i)=>A(console.debug,...i),log:(...i)=>A(console.log,...i),warn:(...i)=>A(console.warn,...i),error:(...i)=>A(console.error,...i)};return(async()=>{try{const{main:i,...t}=G,r=new k("bsky_alt_generator",t);return await i(r)}catch(i){throw $.error('The content script "bsky_alt_generator" crashed on startup!',i),i}})()}();
bskyaltgenerator;
