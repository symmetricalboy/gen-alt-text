var background=function(){"use strict";var m,f;function I(t){return t==null||typeof t=="function"?{main:t}:t}const h=(f=(m=globalThis.browser)==null?void 0:m.runtime)!=null&&f.id?globalThis.browser:globalThis.chrome,k=I(()=>{console.log("Bluesky Alt Text Generator background script loaded");const t="AIzaSyAx4lu3oWb8dxjNTpwzlg-asd9M44vYtN0",y=`You will be provided with visual media (either a still image or a video file). Your task is to generate alternative text (alt-text) that describes the media's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the visual information. Adhere to the following guidelines strictly:

1.  **Media Type Identification:**
    *   Begin by identifying the type of media. For images, note if it is a "photograph", "painting", "illustration", "diagram", "screenshot", "comic panel", etc. For videos, start the description with "Video describing...".

2.  **Content and Purpose:**
    *   Describe the visual content accurately and thoroughly. Explain the media in the context that it is presented.
    *   Convey the media's purpose. Why is this included? What information is it trying to present? What is the core message?
    *   Prioritize the most important information, placing it at the beginning of the alt-text.
    *   If the image serves a specific function (e.g., a button or a link), describe the function. Example: "Search button" or "Link to the homepage".

3.  **Video-Specific Instructions:**
    *   For videos, describe the key visual elements, actions, scenes, and any text overlays that appear throughout the *duration* of the video playback. Focus on conveying the narrative or informational flow presented visually. Do *not* just describe a single frame or thumbnail.

4.  **Sequential Art (Comics/Webcomics):**
    *   For media containing sequential art like comic panels or webcomics, describe the narrative progression. Detail the actions, characters, settings, and dialogue/captions within each panel or across the sequence to tell the story visually represented.

5.  **Text within the Media:**
    *   If the media contains text (e.g., signs, labels, captions, text overlays in videos), transcribe the text *verbatim* within the alt-text. Indicate that this is a direct quote by using quotation marks. Example: 'A sign that reads, "Proceed with Caution".'
    *   **Crucially**, if the media consists primarily of a large block of text (e.g., a screenshot of an article, a quote graphic, a presentation slide), you MUST transcribe the *entire* text content verbatim, up to a practical limit (e.g., 2000 characters). Accuracy and completeness of the text take precedence over brevity in these cases.
    *   For screenshots containing User Interface (UI) elements, transcribe essential text (button labels, input field values, key menu items). Exercise judgment to omit minor or redundant UI text (tooltips, decorative labels) that doesn't significantly contribute to understanding the core function or state shown. Example: "Screenshot of a software settings window. The 'Notifications' tab is active, showing a checkbox labeled \\"Enable desktop alerts\\" which is checked."

6.  **Brevity and Clarity:**
    *   Keep descriptions concise *except* when transcribing significant amounts of text or describing sequential narratives (comics, videos), where clarity and completeness are more important. Aim for under 125 characters for simple images where possible.
    *   Use clear, simple language. Avoid jargon unless it's part of transcribed text or essential to the meaning.
    *   Use proper grammar, punctuation, and capitalization. End sentences with a period.

7.  **Notable Individuals:**
    *   If the media features recognizable people, identify them by name. If their role or title is relevant, include that too. Example: "Photograph of Dr. Jane Goodall observing chimpanzees."

8.  **Inappropriate or Sensitive Content:**
    *   If the media depicts potentially sensitive, offensive, or harmful content, maintain a professional, objective, and clinical tone.
    *   Describe the factual visual content accurately but avoid graphic or sensationalized language. Aim for a descriptive level appropriate for a general audience (e.g., PG-13).

9.  **Output Format:**
    *   Provide *only* the descriptive alt-text. Do *not* include any introductory phrases (e.g., "The image shows...", "Alt-text:"), conversational filler, or follow-up statements. Output *just* the description.

10. **Decorative Media:**
    *   If an image is purely decorative and adds no informational value (e.g., a background pattern), provide empty alt-text (\`alt=""\`). Be certain it provides no value before doing so. Videos are generally not decorative.

11. **Do Not's:**
    * Do not begin descriptions with generic phrases like "Image of...", "Video of...", etc., unless specifying the type as in Guideline 1.
    * Do not add external information, interpretations, or assumptions not directly represented in the visual media itself.
    * Do not repeat information already present in surrounding text content on the page.

By consistently applying these guidelines, you will create alt-text that is informative, accurate, concise where appropriate, and genuinely helpful for users of assistive technology across different types of visual media.`;async function D(e,n){if(e.startsWith("data:")){console.log("[getBase64Data] Source is Data URL, extracting...");const o=e.match(/^data:(.+?);base64,(.*)$/);if(!o||o.length<3)throw console.error("[getBase64Data] Invalid Data URL format received:",e.substring(0,100)+"..."),new Error("Invalid Data URL format received from content script");const a=o[1],i=o[2];return console.log("[getBase64Data] Extracted mimeType:",a,"data length:",i.length),{base64Data:i,mimeType:a}}else throw console.error("[getBase64Data] ERROR: Received non-Data URL source despite changes:",e.substring(0,100)+"..."),new Error("Background script received a non-Data URL source unexpectedly.")}async function b(e,n,o){var a,i,l,r,v;try{const{base64Data:s,mimeType:g}=await D(e,o);console.log(`Generating alt text for ${n?"video":"image"} (type: ${g})`);const E="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",A={contents:[{parts:[{text:y},{inline_data:{mime_type:g,data:s}}]}]},d=await fetch(`${E}?key=${t}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(A)});if(!d.ok){const w=await d.text();throw console.error("Gemini API error response:",w),new Error(`Gemini API error: ${d.status} - ${w.substring(0,100)}...`)}const x=await d.json(),p=(v=(r=(l=(i=(a=x.candidates)==null?void 0:a[0])==null?void 0:i.content)==null?void 0:l.parts)==null?void 0:r[0])==null?void 0:v.text;if(console.log("Extracted alt text:",p),!p)throw console.error("Generated text missing from Gemini response:",x),new Error("Could not extract text from Gemini response");return{altText:p.trim()}}catch(s){return console.error("Error in generateAltTextForMedia:",s),{error:s instanceof Error?s.message:"Unknown error during generation"}}}h.runtime.onConnect.addListener(e=>{console.log(`Port connected: ${e.name}`,e.sender),e.name==="altTextGenerator"&&(e.onMessage.addListener(async n=>{if(console.log("Port message received:",n),n.action==="generateAltText"&&n.imageUrl&&typeof n.isVideo=="boolean"){console.log(`Port request: Generate alt text for ${n.imageUrl}, isVideo: ${n.isVideo}`);const o=await b(n.imageUrl,n.isVideo,void 0);console.log("Sending result back via port:",o);try{e.postMessage(o)}catch(a){console.error("Error posting message back via port:",a)}}else console.warn("Received unknown message format or action via port:",n)}),e.onDisconnect.addListener(()=>{console.log(`Port ${e.name} disconnected.`)}))}),h.runtime.onMessage.addListener(async(e,n,o)=>{var a;if(console.log("General message received:",e.type,"from sender:",(a=n.tab)==null?void 0:a.id),e.type==="MEDIA_INTERCEPTED"&&e.payload){const i=e.payload;console.log(`Intercepted media: ${i.filename} (${i.filetype}, ${i.size} bytes)`),console.log("Attempting immediate generation for intercepted media...");const l=i.filetype.startsWith("video/"),r=await b(i.dataUrl,l,i.filetype);return console.log("Result for intercepted media:",r),o({status:"Intercepted and processed",filename:i.filename,result:r}),!0}else console.log("Ignoring unknown message type or missing payload:",e.type);return!1}),console.log("Background script event listeners attached.")});function $(){}function c(t,...y){}const T={debug:(...t)=>c(console.debug,...t),log:(...t)=>c(console.log,...t),warn:(...t)=>c(console.warn,...t),error:(...t)=>c(console.error,...t)};let u;try{u=k.main(),u instanceof Promise&&console.warn("The background's main() function return a promise, but it must be synchronous")}catch(t){throw T.error("The background crashed on startup!"),t}return u}();
background;
