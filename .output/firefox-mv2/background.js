var background=function(){"use strict";var m,u;function x(e){return e==null||typeof e=="function"?{main:e}:e}const I=x(()=>{console.log("Bluesky Alt Text Generator background script loaded");const e="AIzaSyAx4lu3oWb8dxjNTpwzlg-asd9M44vYtN0",p=`You will be provided with images. For each image, your task is to generate alternative text (alt-text) that describes the image's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the image. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text that is informative, concise, and helpful for users of assistive technology.`;chrome.runtime.onConnect.addListener(t=>{var r,s;console.log(`Connection established from ${(s=(r=t.sender)==null?void 0:r.tab)!=null&&s.id?"tab "+t.sender.tab.id:"unknown source"}, name: ${t.name}`),t.name==="altTextGenerator"&&(t.onMessage.addListener(async o=>{var c,f,b,y,w;if(console.log("Message received via port:",o),o.action==="generateAltText"){let i={};try{console.log("Received alt text generation request for image:",o.imageUrl);const n=await fetch(o.imageUrl);if(!n.ok)throw new Error(`Failed to fetch image: ${n.statusText}`);const g=await n.blob(),T=await P(g),A=g.type;console.log("Image fetched and converted to base64");const E="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",U={contents:[{parts:[{text:p},{inline_data:{mime_type:A,data:T}}]}]},l=await fetch(`${E}?key=${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(U)});if(!l.ok){const D=await l.text();throw new Error(`Gemini API error: ${l.status} - ${D}`)}const v=await l.json();console.log("Gemini API response received. Data:",JSON.stringify(v));const h=(w=(y=(b=(f=(c=v.candidates)==null?void 0:c[0])==null?void 0:f.content)==null?void 0:b.parts)==null?void 0:y[0])==null?void 0:w.text;if(console.log("Extracted text:",h),!h)throw console.error("Generated text is missing from Gemini response."),new Error("Could not extract text from Gemini response");i={altText:h.trim()},console.log("Prepared successful response:",i)}catch(n){console.error("Error caught in alt text generation process:",n),i={error:n instanceof Error?n.message:"Unknown error occurred"},console.log("Prepared error response:",i)}if(t){console.log("Attempting to post response message via port:",i);try{t.postMessage(i),console.log("Successfully posted message via port.")}catch(n){console.error("Error posting message back via port:",n," Port disconnected?")}}else console.error("Port was disconnected before response could be sent.")}else console.warn("Received unknown action via port:",o.action)}),t.onDisconnect.addListener(()=>{console.log(`Port ${t.name} disconnected.`)}))});function P(t){return new Promise((r,s)=>{const o=new FileReader;o.onloadend=()=>{const c=o.result.split(",")[1];r(c)},o.onerror=s,o.readAsDataURL(t)})}});function C(){}(u=(m=globalThis.browser)==null?void 0:m.runtime)!=null&&u.id?globalThis.browser:globalThis.chrome;function a(e,...p){}const k={debug:(...e)=>a(console.debug,...e),log:(...e)=>a(console.log,...e),warn:(...e)=>a(console.warn,...e),error:(...e)=>a(console.error,...e)};let d;try{d=I.main(),d instanceof Promise&&console.warn("The background's main() function return a promise, but it must be synchronous")}catch(e){throw k.error("The background crashed on startup!"),e}return d}();
background;
