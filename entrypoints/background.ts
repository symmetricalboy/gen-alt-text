// Define expected message structures for type safety
interface InterceptedMediaPayload {
  filename: string;
  filetype: string;
  dataUrl: string; // Base64 Data URL (e.g., data:image/png;base64,...)
  size: number;
}

interface GenerateAltTextPayload {
  imageUrl: string; // Could be blob:, data:, or https:
  isVideo: boolean;
}

// Define a generic message type
interface BackgroundMessage {
  type: 'MEDIA_INTERCEPTED' | 'generateAltText'; // Add other types as needed
  payload: InterceptedMediaPayload | GenerateAltTextPayload | any; // Use specific types or any if mixed
}

export default defineBackground(() => {
  console.log('Bluesky Alt Text Generator background script loaded');
  
  // Check API key early
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('VITE_GEMINI_API_KEY not found - please add it to .env file');
  }
  
  // Store the custom instructions
  const imageInstructions = `You will be provided with images. For each image, your task is to generate alternative text (alt-text) that describes the image's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the image. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text that is informative, concise, and helpful for users of assistive technology.`;

  // Store video-specific instructions
  const videoInstructions = `You will be provided with a video thumbnail image. Your task is to generate alternative text (alt-text) that describes the video's content and context based on this thumbnail. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand what the video is about. Adhere to the following guidelines strictly:

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

By consistently applying these guidelines, you will create alt-text for video thumbnails that is informative, concise, and helpful for users of assistive technology.`;
  
  // --- Helper function to extract Base64 data --- 
  // Handles both data URLs and fetching blob/http URLs
  // !! Now simplified: Assumes input 'source' is ALWAYS a Data URL !!
  async function getBase64Data(source: string, mimeTypeHint?: string): Promise<{ base64Data: string; mimeType: string }> {
    // Removed fetch logic, expecting only Data URLs now
    if (source.startsWith('data:')) {
      // Already a Data URL
      console.log('[getBase64Data] Source is Data URL, extracting...');
      const parts = source.match(/^data:(.+?);base64,(.*)$/);
      if (!parts || parts.length < 3) {
        console.error('[getBase64Data] Invalid Data URL format received:', source.substring(0, 100) + '...');
        throw new Error('Invalid Data URL format received from content script');
      }
      const mimeType = parts[1];
      const base64Data = parts[2];
      console.log('[getBase64Data] Extracted mimeType:', mimeType, 'data length:', base64Data.length);
      return { base64Data, mimeType };
    } else {
      // This case should ideally not happen anymore
      console.error('[getBase64Data] ERROR: Received non-Data URL source despite changes:', source.substring(0, 100) + '...');
      throw new Error('Background script received a non-Data URL source unexpectedly.');
      // // Assume it's a URL (blob:, https:, etc.) that needs fetching
      // console.log('Source is URL, fetching:', source);
      // const fetchResponse = await fetch(source);
      // if (!fetchResponse.ok) {
      //   throw new Error(`Failed to fetch media URL: ${fetchResponse.statusText}`);
      // }
      // const blob = await fetchResponse.blob();
      // const mimeType = mimeTypeHint || blob.type || 'application/octet-stream'; // Use hint or blob type
      // console.log('Fetched blob, type:', mimeType);
      // 
      // // Convert blob to base64
      // return new Promise((resolve, reject) => {
      //   const reader = new FileReader();
      //   reader.onloadend = () => {
      //     if (typeof reader.result === 'string') {
      //       const base64WithPrefix = reader.result;
      //       const base64Data = base64WithPrefix.split(',')[1]; // Remove data:*/*;base64,
      //       if (base64Data) {
      //         console.log('Blob converted to base64');
      //         resolve({ base64Data, mimeType });
      //       } else {
      //         reject(new Error('Failed to extract base64 data from blob reader result.'));
      //       }
      //     } else {
      //       reject(new Error('Blob reader result was not a string.'));
      //     }
      //   };
      //   reader.onerror = reject;
      //   reader.readAsDataURL(blob);
      // });
    }
  }
  
  // --- Main Alt Text Generation Logic ---
  async function generateAltTextForMedia(
    source: string, // Can be Data URL or fetchable URL
    isVideo: boolean,
    mimeTypeHint?: string // Optional hint for fetched blobs
  ): Promise<{ altText: string } | { error: string }> {
      try {
          if (!GEMINI_API_KEY) throw new Error('Missing Gemini API Key');
          
          // 1. Get Base64 data and final mime type
          const { base64Data, mimeType } = await getBase64Data(source, mimeTypeHint);
          console.log(`Generating alt text for ${isVideo ? 'video' : 'image'} (type: ${mimeType})`);

          // 2. Call Gemini API
          const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
          const instructions = isVideo ? videoInstructions : imageInstructions;
          
          const geminiRequestBody = {
              contents: [{
                  parts: [
                      { text: instructions },
                      { inline_data: { mime_type: mimeType, data: base64Data } }
                  ]
              }]
          };
          
          const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(geminiRequestBody)
          });

          if (!geminiResponse.ok) {
              const errorText = await geminiResponse.text();
              console.error('Gemini API error response:', errorText);
              throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText.substring(0, 100)}...`);
          }

          const geminiData = await geminiResponse.json();
          // console.log('Gemini API full response:', JSON.stringify(geminiData)); // Verbose log
          
          const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          console.log('Extracted alt text:', generatedText);

          if (!generatedText) {
              console.error('Generated text missing from Gemini response:', geminiData);
              throw new Error('Could not extract text from Gemini response');
          }

          return { altText: generatedText.trim() };
          
      } catch (error: unknown) {
          console.error('Error in generateAltTextForMedia:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error during generation';
          return { error: errorMessage };
      }
  }

  // --- Listener for Port Connections (from original button click) ---
  browser.runtime.onConnect.addListener((port) => {
    console.log(`Port connected: ${port.name}`, port.sender);

    if (port.name === "altTextGenerator") {
      port.onMessage.addListener(async (message: BackgroundMessage) => {
        console.log('Port message received:', message);

        if (message.type === 'generateAltText' && message.payload) {
          const payload = message.payload as GenerateAltTextPayload;
          console.log(`Port request: Generate alt text for ${payload.imageUrl}, isVideo: ${payload.isVideo}`);
          
          // Use the main generation function, fetching if necessary
          const result = await generateAltTextForMedia(payload.imageUrl, payload.isVideo);
          
          console.log('Sending result back via port:', result);
          try {
            port.postMessage(result); // Send {altText: ...} or {error: ...}
          } catch (postError: unknown) {
            console.error('Error posting message back via port:', postError);
          }
        } else {
          console.warn('Received unknown message type via port:', message.type);
        }
      });

      port.onDisconnect.addListener(() => {
         console.log(`Port ${port.name} disconnected.`);
         // Optional cleanup here
      });
    }
  });
  
  // --- Listener for General Messages (like MEDIA_INTERCEPTED) ---
  browser.runtime.onMessage.addListener(async (message: BackgroundMessage, sender, sendResponse) => {
    console.log('General message received:', message.type, 'from sender:', sender.tab?.id);

    if (message.type === 'MEDIA_INTERCEPTED' && message.payload) {
      const payload = message.payload as InterceptedMediaPayload;
      console.log(`Intercepted media: ${payload.filename} (${payload.filetype}, ${payload.size} bytes)`);
      
      // --- TODO: Decide if/when to trigger generation for intercepted media --- 
      // Option 1: Generate immediately (demonstrated below)
      // Option 2: Store it and wait for user action (e.g., button click in popup)
      // Option 3: Only generate if auto-mode is enabled in config
      
      console.log('Attempting immediate generation for intercepted media...');
      const isVideo = payload.filetype.startsWith('video/');
      
      // Use the main generation function with the provided Data URL
      const result = await generateAltTextForMedia(payload.dataUrl, isVideo, payload.filetype);
      
      console.log('Result for intercepted media:', result);
      
      // What to do with the result? 
      // - Could send it back to the content script (though it might not expect it)
      // - Could store it for later retrieval
      // - Could update a popup UI
      
      // Example: Send acknowledgement back to content script
      sendResponse({ status: 'Intercepted and processed', filename: payload.filename, result });
      return true; // Indicate async response

    } else {
      console.log('Ignoring unknown message type or missing payload:', message.type);
      // Optional: Send response for unhandled types if needed
      // sendResponse({ status: 'Unknown message type' });
    }
    
    // Return false if not sending an asynchronous response.
    return false; 
  });
  
  console.log('Background script event listeners attached.');
}); 