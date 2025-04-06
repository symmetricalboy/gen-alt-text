var background=function(){"use strict";var f,b;function T(e){return e==null||typeof e=="function"?{main:e}:e}const k=T(()=>{console.log("Bluesky Alt Text Generator background script loaded");const e="AIzaSyAx4lu3oWb8dxjNTpwzlg-asd9M44vYtN0",l=`You will be provided with images. For each image, your task is to generate alternative text (alt-text) that describes the image's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the image. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text that is informative, concise, and helpful for users of assistive technology.`,m=`You will be provided with a video thumbnail image. Your task is to generate alternative text (alt-text) that describes the video's content and context based on this thumbnail. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand what the video is about. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text for video thumbnails that is informative, concise, and helpful for users of assistive technology.`;chrome.runtime.onConnect.addListener(t=>{var o,a;console.log(`Connection established from ${(a=(o=t.sender)==null?void 0:o.tab)!=null&&a.id?"tab "+t.sender.tab.id:"unknown source"}, name: ${t.name}`),t.name==="altTextGenerator"&&(t.onMessage.addListener(async i=>{var d,y,v,w,x;if(console.log("Message received via port:",i),i.action==="generateAltText"){let r={};try{console.log("Received alt text generation request for media:",i.imageUrl),console.log("Is video?",i.isVideo);const n=await fetch(i.imageUrl);if(!n.ok)throw new Error(`Failed to fetch media: ${n.statusText}`);const g=await n.blob(),P=await c(g),A=g.type;console.log("Media fetched and converted to base64");const D="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",C={contents:[{parts:[{text:i.isVideo?m:l},{inline_data:{mime_type:A,data:P}}]}]},h=await fetch(`${D}?key=${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(C)});if(!h.ok){const U=await h.text();throw new Error(`Gemini API error: ${h.status} - ${U}`)}const I=await h.json();console.log("Gemini API response received. Data:",JSON.stringify(I));const p=(x=(w=(v=(y=(d=I.candidates)==null?void 0:d[0])==null?void 0:y.content)==null?void 0:v.parts)==null?void 0:w[0])==null?void 0:x.text;if(console.log("Extracted text:",p),!p)throw console.error("Generated text is missing from Gemini response."),new Error("Could not extract text from Gemini response");r={altText:p.trim()},console.log("Prepared successful response:",r)}catch(n){console.error("Error caught in alt text generation process:",n),r={error:n instanceof Error?n.message:"Unknown error occurred"},console.log("Prepared error response:",r)}if(t){console.log("Attempting to post response message via port:",r);try{t.postMessage(r),console.log("Successfully posted message via port.")}catch(n){console.error("Error posting message back via port:",n," Port disconnected?")}}else console.error("Port was disconnected before response could be sent.")}else console.warn("Received unknown action via port:",i.action)}),t.onDisconnect.addListener(()=>{console.log(`Port ${t.name} disconnected.`)}))});function c(t){return new Promise((o,a)=>{const i=new FileReader;i.onloadend=()=>{const d=i.result.split(",")[1];o(d)},i.onerror=a,i.readAsDataURL(t)})}});chrome.runtime.onMessage.addListener((e,l,m)=>{var c,t,o,a;return console.log("General message received:",e,"from sender:",l),e.type==="MEDIA_INTERCEPTED"?(console.log("Received intercepted media data:"),console.log(`  Filename: ${(c=e.payload)==null?void 0:c.filename}`),console.log(`  Type: ${(t=e.payload)==null?void 0:t.filetype}`),console.log(`  Size: ${(o=e.payload)==null?void 0:o.size} bytes`),m({status:"Received media",filename:(a=e.payload)==null?void 0:a.filename})):console.log("Received message of unknown type:",e.type),!1});function M(){}(b=(f=globalThis.browser)==null?void 0:f.runtime)!=null&&b.id?globalThis.browser:globalThis.chrome;function s(e,...l){}const E={debug:(...e)=>s(console.debug,...e),log:(...e)=>s(console.log,...e),warn:(...e)=>s(console.warn,...e),error:(...e)=>s(console.error,...e)};let u;try{u=k.main(),u instanceof Promise&&console.warn("The background's main() function return a promise, but it must be synchronous")}catch(e){throw E.error("The background crashed on startup!"),e}return u}();
background;
