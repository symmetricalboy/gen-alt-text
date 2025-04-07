var background=function(){"use strict";var f,b;function I(t){return t==null||typeof t=="function"?{main:t}:t}const p=(b=(f=globalThis.browser)==null?void 0:f.runtime)!=null&&b.id?globalThis.browser:globalThis.chrome,T=I(()=>{console.log("Bluesky Alt Text Generator background script loaded");const t="AIzaSyAx4lu3oWb8dxjNTpwzlg-asd9M44vYtN0",y=`You will be provided with images. For each image, your task is to generate alternative text (alt-text) that describes the image's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the image. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text that is informative, concise, and helpful for users of assistive technology.`,E=`You will be provided with a video thumbnail image. Your task is to generate alternative text (alt-text) that describes the video's content and context based on this thumbnail. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand what the video is about. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text for video thumbnails that is informative, concise, and helpful for users of assistive technology.`;async function D(e,a){if(e.startsWith("data:")){console.log("Source is Data URL");const n=e.match(/^data:(.+?);base64,(.*)$/);if(!n||n.length<3)throw new Error("Invalid Data URL format");const o=n[1];return{base64Data:n[2],mimeType:o}}else{console.log("Source is URL, fetching:",e);const n=await fetch(e);if(!n.ok)throw new Error(`Failed to fetch media URL: ${n.statusText}`);const o=await n.blob(),i=a||o.type||"application/octet-stream";return console.log("Fetched blob, type:",i),new Promise((l,r)=>{const s=new FileReader;s.onloadend=()=>{if(typeof s.result=="string"){const d=s.result.split(",")[1];d?(console.log("Blob converted to base64"),l({base64Data:d,mimeType:i})):r(new Error("Failed to extract base64 data from blob reader result."))}else r(new Error("Blob reader result was not a string."))},s.onerror=r,s.readAsDataURL(o)})}}async function v(e,a,n){var o,i,l,r,s;try{const{base64Data:c,mimeType:d}=await D(e,n);console.log(`Generating alt text for ${a?"video":"image"} (type: ${d})`);const A="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",P={contents:[{parts:[{text:a?E:y},{inline_data:{mime_type:d,data:c}}]}]},u=await fetch(`${A}?key=${t}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(P)});if(!u.ok){const x=await u.text();throw console.error("Gemini API error response:",x),new Error(`Gemini API error: ${u.status} - ${x.substring(0,100)}...`)}const w=await u.json(),m=(s=(r=(l=(i=(o=w.candidates)==null?void 0:o[0])==null?void 0:i.content)==null?void 0:l.parts)==null?void 0:r[0])==null?void 0:s.text;if(console.log("Extracted alt text:",m),!m)throw console.error("Generated text missing from Gemini response:",w),new Error("Could not extract text from Gemini response");return{altText:m.trim()}}catch(c){return console.error("Error in generateAltTextForMedia:",c),{error:c instanceof Error?c.message:"Unknown error during generation"}}}p.runtime.onConnect.addListener(e=>{console.log(`Port connected: ${e.name}`,e.sender),e.name==="altTextGenerator"&&(e.onMessage.addListener(async a=>{if(console.log("Port message received:",a),a.type==="generateAltText"&&a.payload){const n=a.payload;console.log(`Port request: Generate alt text for ${n.imageUrl}, isVideo: ${n.isVideo}`);const o=await v(n.imageUrl,n.isVideo);console.log("Sending result back via port:",o);try{e.postMessage(o)}catch(i){console.error("Error posting message back via port:",i)}}else console.warn("Received unknown message type via port:",a.type)}),e.onDisconnect.addListener(()=>{console.log(`Port ${e.name} disconnected.`)}))}),p.runtime.onMessage.addListener(async(e,a,n)=>{var o;if(console.log("General message received:",e.type,"from sender:",(o=a.tab)==null?void 0:o.id),e.type==="MEDIA_INTERCEPTED"&&e.payload){const i=e.payload;console.log(`Intercepted media: ${i.filename} (${i.filetype}, ${i.size} bytes)`),console.log("Attempting immediate generation for intercepted media...");const l=i.filetype.startsWith("video/"),r=await v(i.dataUrl,l,i.filetype);return console.log("Result for intercepted media:",r),n({status:"Intercepted and processed",filename:i.filename,result:r}),!0}else console.log("Ignoring unknown message type or missing payload:",e.type);return!1}),console.log("Background script event listeners attached.")});function $(){}function h(t,...y){}const k={debug:(...t)=>h(console.debug,...t),log:(...t)=>h(console.log,...t),warn:(...t)=>h(console.warn,...t),error:(...t)=>h(console.error,...t)};let g;try{g=T.main(),g instanceof Promise&&console.warn("The background's main() function return a promise, but it must be synchronous")}catch(t){throw k.error("The background crashed on startup!"),t}return g}();
background;
