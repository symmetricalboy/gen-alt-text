var background=function(){"use strict";var p,f;function I(t){return t==null||typeof t=="function"?{main:t}:t}const m=(f=(p=globalThis.browser)==null?void 0:p.runtime)!=null&&f.id?globalThis.browser:globalThis.chrome,T=I(()=>{console.log("Bluesky Alt Text Generator background script loaded");const t="AIzaSyAx4lu3oWb8dxjNTpwzlg-asd9M44vYtN0",y=`You will be provided with images. For each image, your task is to generate alternative text (alt-text) that describes the image's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the image. Adhere to the following guidelines strictly:

1.  **Content and Purpose:**
    *   Describe the image's content accurately and thoroughly. Explain the image in the context that it is presented.
    *   Convey the image's purpose. Why is this image included? What information is it trying to present? What is the core message?
    *   Prioritize the most important information, placing it at the beginning of the alt-text.
    *   If the image serves a specific function (e.g., a button or a link), describe the function. Example: "Search button" or "Link to the homepage".
    * Note if this image is a, "photograph", "painting", "illustration", "diagram", or otherwise.

2.  **Text within the Image:**
    *   If the image contains text, transcribe the text *verbatim* within the alt-text. Indicate that this is a direct quote from the image by using quotation marks. Example: 'A sign that reads, "Welcome to Our Store. Open 24/7".'
    *    If the image contain a large block of text, such as a screenshot of an article, again, we must ALWAY, *verbatim*, quote the image, up to 2000 characters.
    *    For screenshots with UI elements, exercise careful judgment. Omit minor UI text (e.g., menu item hover text, tooltips) that doesn't contribute significantly to understanding the core content of the screenshot. Focus on describing the main UI elements and their states (e.g., "A webpage with a navigation menu expanded, showing options for 'Home', 'About', and 'Contact'.").

3.  **Brevity and Clarity:**
    *   Keep descriptions concise, ideally under 100-125 characters where possible, *except* when transcribing text within the image. Longer text transcriptions take precedence over brevity.
    *   Use clear, simple language. Avoid jargon or overly technical terms unless they are essential to the image's meaning and present within the image itself.
    *   Use proper grammar, punctuation, and capitalization. End sentences with a period.

4.  **Notable Individuals:**
    *   If the image contains recognizable people, identify them by name. If their role or title is relevant to the image's context, include that as well. Example: "Photo of Barack Obama, former President of the United States, giving a speech."

5.  **Inappropriate or Sensitive Content:**
    *   If an image depicts content that is potentially inappropriate, offensive, or harmful, maintain a professional and objective tone.
    *   Use clinical and descriptive language, avoiding overly graphic or sensationalized phrasing. Focus on conveying the factual content of the image without unnecessary embellishment. Strive for a PG-13 level of description.

6.  **Output Format:**
    *   Provide *only* the image description. Do *not* include any introductory phrases (e.g., "The image shows...", "Alt-text:"), conversational elements ("Here's the description"), or follow-up statements ("Let me know if you need..."). Output *just* the descriptive text.

7.  **Decorative Images:**
    *   If the image is purely decorative and provides no information, do not supply alt-text. Leave it empty. But make certain that the image is, for a fact, not providing any value before doing so.

8. **Do Not's:**
    * Do not begin alt text with, "Image of..", or similar phrasing, it is already implied.
    * Do not add additional information that is not directly shown within the image.
    * Do not repeat information that already exists in adjacent text.

By consistently applying these guidelines, you will create alt-text that is informative, concise, and helpful for users of assistive technology.`,k=`You will be provided with a video thumbnail image. Your task is to generate alternative text (alt-text) that describes the video's content and context based on this thumbnail. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand what the video is about. Adhere to the following guidelines strictly:

1.  **Video Thumbnail Content:**
    *   Describe what can be seen in the video thumbnail accurately and thoroughly.
    *   Mention that this is a "video thumbnail" at the beginning of your description.
    *   If the thumbnail shows a frame from the video, describe the scene, setting, people, and any visible action.
    *   If the thumbnail has a custom cover image or title card, describe that and indicate it's a cover image.

2.  **Text within the Thumbnail:**
    *   If the thumbnail contains text such as a title, caption, or other information, transcribe this text *verbatim* within the alt-text.
    *   Example: 'Video thumbnail showing a cooking demonstration with text overlay reading, "5-Minute Pasta Recipe".'
    *   Indicate that this is a direct quote by using quotation marks.

3.  **Brevity and Clarity:**
    *   Keep descriptions concise, ideally under 100-125 characters where possible, *except* when transcribing text within the thumbnail.
    *   Use clear, simple language. Avoid jargon or overly technical terms unless they are essential.
    *   Use proper grammar, punctuation, and capitalization. End sentences with a period.

4.  **Notable Individuals:**
    *   If the thumbnail shows recognizable people, identify them by name if possible. Example: "Video thumbnail featuring Taylor Swift performing on stage."

5.  **Indicators of Video Content:**
    *   Note any visual cues that indicate the video's content or genre (e.g., play button overlay, duration indicator, channel name).
    *   If the thumbnail gives clear indication of what the video contains, include that information.

6.  **Output Format:**
    *   Provide *only* the video thumbnail description. Do not include any introductory phrases, conversational elements, or follow-up statements. Output *just* the descriptive text.

7. **Do Not's:**
    * Do not speculate extensively about what might be in the full video beyond what is visible in the thumbnail.
    * Do not add additional information that is not directly shown within the thumbnail.
    * Do not repeat information that already exists in adjacent text.

By consistently applying these guidelines, you will create alt-text for video thumbnails that is informative, concise, and helpful for users of assistive technology.`;async function E(e,o){if(e.startsWith("data:")){console.log("[getBase64Data] Source is Data URL, extracting...");const i=e.match(/^data:(.+?);base64,(.*)$/);if(!i||i.length<3)throw console.error("[getBase64Data] Invalid Data URL format received:",e.substring(0,100)+"..."),new Error("Invalid Data URL format received from content script");const a=i[1],n=i[2];return console.log("[getBase64Data] Extracted mimeType:",a,"data length:",n.length),{base64Data:n,mimeType:a}}else throw console.error("[getBase64Data] ERROR: Received non-Data URL source despite changes:",e.substring(0,100)+"..."),new Error("Background script received a non-Data URL source unexpectedly.")}async function b(e,o,i){var a,n,c,r,v;try{const{base64Data:s,mimeType:g}=await E(e,i);console.log(`Generating alt text for ${o?"video":"image"} (type: ${g})`);const A="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",P={contents:[{parts:[{text:o?k:y},{inline_data:{mime_type:g,data:s}}]}]},d=await fetch(`${A}?key=${t}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(P)});if(!d.ok){const x=await d.text();throw console.error("Gemini API error response:",x),new Error(`Gemini API error: ${d.status} - ${x.substring(0,100)}...`)}const w=await d.json(),u=(v=(r=(c=(n=(a=w.candidates)==null?void 0:a[0])==null?void 0:n.content)==null?void 0:c.parts)==null?void 0:r[0])==null?void 0:v.text;if(console.log("Extracted alt text:",u),!u)throw console.error("Generated text missing from Gemini response:",w),new Error("Could not extract text from Gemini response");return{altText:u.trim()}}catch(s){return console.error("Error in generateAltTextForMedia:",s),{error:s instanceof Error?s.message:"Unknown error during generation"}}}m.runtime.onConnect.addListener(e=>{console.log(`Port connected: ${e.name}`,e.sender),e.name==="altTextGenerator"&&(e.onMessage.addListener(async o=>{if(console.log("Port message received:",o),o.type==="generateAltText"&&o.payload){const i=o.payload;console.log(`Port request: Generate alt text for ${i.imageUrl}, isVideo: ${i.isVideo}`);const a=await b(i.imageUrl,i.isVideo);console.log("Sending result back via port:",a);try{e.postMessage(a)}catch(n){console.error("Error posting message back via port:",n)}}else console.warn("Received unknown message type via port:",o.type)}),e.onDisconnect.addListener(()=>{console.log(`Port ${e.name} disconnected.`)}))}),m.runtime.onMessage.addListener(async(e,o,i)=>{var a;if(console.log("General message received:",e.type,"from sender:",(a=o.tab)==null?void 0:a.id),e.type==="MEDIA_INTERCEPTED"&&e.payload){const n=e.payload;console.log(`Intercepted media: ${n.filename} (${n.filetype}, ${n.size} bytes)`),console.log("Attempting immediate generation for intercepted media...");const c=n.filetype.startsWith("video/"),r=await b(n.dataUrl,c,n.filetype);return console.log("Result for intercepted media:",r),i({status:"Intercepted and processed",filename:n.filename,result:r}),!0}else console.log("Ignoring unknown message type or missing payload:",e.type);return!1}),console.log("Background script event listeners attached.")});function $(){}function l(t,...y){}const D={debug:(...t)=>l(console.debug,...t),log:(...t)=>l(console.log,...t),warn:(...t)=>l(console.warn,...t),error:(...t)=>l(console.error,...t)};let h;try{h=T.main(),h instanceof Promise&&console.warn("The background's main() function return a promise, but it must be synchronous")}catch(t){throw D.error("The background crashed on startup!"),t}return h}();
background;
