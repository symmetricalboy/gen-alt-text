var bskyaltgenerator=function(){"use strict";var F=Object.defineProperty;var R=(u,a,m)=>a in u?F(u,a,{enumerable:!0,configurable:!0,writable:!0,value:m}):u[a]=m;var d=(u,a,m)=>R(u,typeof a!="symbol"?a+"":a,m);var w,S;function u(o){return o}const a={matches:["*://*.bsky.app/*"],main(){if(console.log("Bluesky Alt Text Generator loaded"),typeof window>"u"||typeof document>"u")return;const o='textarea[aria-label="Alt text"]',t="gemini-alt-text-button";function n(i){var I,N;if(console.log("addGenerateButton called for textarea:",i),i.dataset.geminiButtonAdded==="true"){console.log("Button already added to this textarea, skipping.");return}let l=i.closest('div[data-testid="composer"]');if(l?console.log("Found container via closest():",l):(l=(N=(I=i.parentElement)==null?void 0:I.parentElement)==null?void 0:N.parentElement,console.log("Using fallback container:",l)),!l){console.error("Could not find a suitable container for the button near textarea:",i);return}if(l.querySelector(`#${t}`)){console.log("Button already exists in this container, skipping.");return}const e=document.createElement("button");e.id=t,e.title="Generate Alt Text";const s=document.createElement("img");s.src=chrome.runtime.getURL("icon/gen-alt-text.svg"),s.alt="Generate Alt Text",s.style.width="20px",s.style.height="20px",s.style.display="block",e.appendChild(s),e.style.marginLeft="8px",e.style.padding="4px",e.style.cursor="pointer",e.style.border="1px solid #ccc",e.style.borderRadius="4px",e.style.backgroundColor="#f0f0f0",e.style.display="flex",e.style.alignItems="center",e.style.justifyContent="center",e.style.setProperty("visibility","visible","important"),e.style.setProperty("z-index","9999","important"),e.style.setProperty("position","relative","important"),console.log("Button element created:",e),e.onclick=async A=>{A.preventDefault(),A.stopPropagation(),console.log("Generate Alt Text button clicked"),e.innerHTML="",e.textContent="Connecting...",e.disabled=!0;let y=document.querySelector("#root > div > div > div > div > div.css-175oi2r > div:nth-child(2) > div > div > div > div:nth-child(2) > div.css-175oi2r > div > div > img");if(console.log("Image found via specific selector:",y),!y||!y.src){console.error("Could not find image element or its src using specific selector."),e.textContent="Error: No Image",setTimeout(()=>{e.textContent="",e.appendChild(s.cloneNode(!0)),e.disabled=!1},2e3);return}const k=y.src;console.log("Image URL:",k);try{console.log("Establishing connection to background script...");const h=chrome.runtime.connect({name:"altTextGenerator"});console.log("Connection established."),e.textContent="Generating...",h.onMessage.addListener(c=>{console.log("Message received from background via port:",c),c.altText?(i.value=c.altText,i.dispatchEvent(new Event("input",{bubbles:!0,cancelable:!0})),console.log("Alt text inserted."),e.textContent="✓ Done",setTimeout(()=>{e.textContent="",e.appendChild(s.cloneNode(!0)),e.disabled=!1},1500)):c.error?(console.error("Error generating alt text:",c.error),e.textContent=`Error: ${c.error.substring(0,20)}...`,setTimeout(()=>{e.textContent="",e.appendChild(s.cloneNode(!0)),e.disabled=!1},3e3)):(console.error("Received unexpected message format from background:",c),e.textContent="Msg Format Error",setTimeout(()=>{e.textContent="",e.appendChild(s.cloneNode(!0)),e.disabled=!1},2e3)),h.disconnect()}),h.onDisconnect.addListener(()=>{console.error("Background port disconnected unexpectedly.",chrome.runtime.lastError||"(No error info)"),!e.textContent.includes("Done")&&!e.textContent.includes("Error")&&(e.textContent="Disconnect Error",setTimeout(()=>{e.textContent="",e.appendChild(s.cloneNode(!0)),e.disabled=!1},3e3))}),console.log("Sending message via port..."),h.postMessage({action:"generateAltText",imageUrl:k}),console.log("Message sent via port.")}catch(h){console.error("Error establishing connection or posting initial message:",h),e.textContent="Connect Error",setTimeout(()=>{e.textContent="",e.appendChild(s.cloneNode(!0)),e.disabled=!1},2e3)}};const g=i.parentNode;g?(console.log("Attempting to append button to parent:",g),g.appendChild(e)):console.error("Could not find parent node to append button to."),i.dataset.geminiButtonAdded="true",console.log("Button insertion attempted. Check the DOM.")}document.querySelectorAll(o).forEach(i=>{n(i)}),new MutationObserver(i=>{console.log("MutationObserver callback triggered.");for(const l of i)l.type==="childList"&&l.addedNodes.forEach(e=>{if(e.nodeType===Node.ELEMENT_NODE){const s=e;s.matches&&s.matches(o)?(console.log("Observer found matching textarea directly:",s),n(s)):s.querySelectorAll&&s.querySelectorAll(o).forEach(g=>{console.log("Observer found matching textarea within added node:",g),n(g)})}})}).observe(document.body,{childList:!0,subtree:!0}),console.log("Alt text generator initialized and watching for textareas")}},f=(S=(w=globalThis.browser)==null?void 0:w.runtime)!=null&&S.id?globalThis.browser:globalThis.chrome;function b(o,...t){}const M={debug:(...o)=>b(console.debug,...o),log:(...o)=>b(console.log,...o),warn:(...o)=>b(console.warn,...o),error:(...o)=>b(console.error,...o)},E=class E extends Event{constructor(t,n){super(E.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};d(E,"EVENT_NAME",x("wxt:locationchange"));let T=E;function x(o){var t;return`${(t=f==null?void 0:f.runtime)==null?void 0:t.id}:bsky_alt_generator:${o}`}function L(o){let t,n;return{run(){t==null&&(n=new URL(location.href),t=o.setInterval(()=>{let r=new URL(location.href);r.href!==n.href&&(window.dispatchEvent(new T(r,n)),n=r)},1e3))}}}const p=class p{constructor(t,n){d(this,"isTopFrame",window.self===window.top);d(this,"abortController");d(this,"locationWatcher",L(this));d(this,"receivedMessageIds",new Set);this.contentScriptName=t,this.options=n,this.abortController=new AbortController,this.isTopFrame?(this.listenForNewerScripts({ignoreFirstEvent:!0}),this.stopOldScripts()):this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return f.runtime.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,n){const r=setInterval(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearInterval(r)),r}setTimeout(t,n){const r=setTimeout(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearTimeout(r)),r}requestAnimationFrame(t){const n=requestAnimationFrame((...r)=>{this.isValid&&t(...r)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(t,n){const r=requestIdleCallback((...i)=>{this.signal.aborted||t(...i)},n);return this.onInvalidated(()=>cancelIdleCallback(r)),r}addEventListener(t,n,r,i){var l;n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),(l=t.addEventListener)==null||l.call(t,n.startsWith("wxt:")?x(n):n,r,{...i,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),M.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){window.postMessage({type:p.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:Math.random().toString(36).slice(2)},"*")}verifyScriptStartedEvent(t){var l,e,s;const n=((l=t.data)==null?void 0:l.type)===p.SCRIPT_STARTED_MESSAGE_TYPE,r=((e=t.data)==null?void 0:e.contentScriptName)===this.contentScriptName,i=!this.receivedMessageIds.has((s=t.data)==null?void 0:s.messageId);return n&&r&&i}listenForNewerScripts(t){let n=!0;const r=i=>{if(this.verifyScriptStartedEvent(i)){this.receivedMessageIds.add(i.data.messageId);const l=n;if(n=!1,l&&(t!=null&&t.ignoreFirstEvent))return;this.notifyInvalidated()}};addEventListener("message",r),this.onInvalidated(()=>removeEventListener("message",r))}};d(p,"SCRIPT_STARTED_MESSAGE_TYPE",x("wxt:content-script-started"));let C=p;function D(){}function v(o,...t){}const _={debug:(...o)=>v(console.debug,...o),log:(...o)=>v(console.log,...o),warn:(...o)=>v(console.warn,...o),error:(...o)=>v(console.error,...o)};return(async()=>{try{const{main:o,...t}=a,n=new C("bsky_alt_generator",t);return await o(n)}catch(o){throw _.error('The content script "bsky_alt_generator" crashed on startup!',o),o}})()}();
bskyaltgenerator;
