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
  const systemInstructions = `You will be provided with visual media (either a still image or a video file). Your task is to generate alternative text (alt-text) that describes the media\'s content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the visual information. Adhere to the following guidelines strictly:

1.  **Media Type Identification:**
    *   Begin by identifying the type of media. For images, note if it is a "photograph", "painting", "illustration", "diagram", "screenshot", "comic panel", etc. For videos, start the description with "Video describing...".

2.  **Content and Purpose:**
    *   Describe the visual content accurately and thoroughly. Explain the media in the context that it is presented.
    *   Convey the media\'s purpose. Why is this included? What information is it trying to present? What is the core message?
    *   Prioritize the most important information, placing it at the beginning of the alt-text.
    *   If the image serves a specific function (e.g., a button or a link), describe the function. Example: "Search button" or "Link to the homepage".

3.  **Video-Specific Instructions:**
    *   For videos, describe the key visual elements, actions, scenes, and any text overlays that appear throughout the *duration* of the video playback. Focus on conveying the narrative or informational flow presented visually. Do *not* just describe a single frame or thumbnail.

4.  **Sequential Art (Comics/Webcomics):**
    *   For media containing sequential art like comic panels or webcomics, describe the narrative progression. Detail the actions, characters, settings, and dialogue/captions within each panel or across the sequence to tell the story visually represented.

5.  **Text within the Media:**
    *   If the media contains text (e.g., signs, labels, captions, text overlays in videos), transcribe the text *verbatim* within the alt-text. Indicate that this is a direct quote by using quotation marks. Example: \'A sign that reads, "Proceed with Caution".\'
    *   **Crucially**, if the media consists primarily of a large block of text (e.g., a screenshot of an article, a quote graphic, a presentation slide), you MUST transcribe the *entire* text content verbatim, up to a practical limit (e.g., 2000 characters). Accuracy and completeness of the text take precedence over brevity in these cases.
    *   For screenshots containing User Interface (UI) elements, transcribe essential text (button labels, input field values, key menu items). Exercise judgment to omit minor or redundant UI text (tooltips, decorative labels) that doesn\'t significantly contribute to understanding the core function or state shown. Example: "Screenshot of a software settings window. The \'Notifications\' tab is active, showing a checkbox labeled \\"Enable desktop alerts\\" which is checked."

6.  **Brevity and Clarity:**
    *   Keep descriptions concise *except* when transcribing significant amounts of text or describing sequential narratives (comics, videos), where clarity and completeness are more important. Aim for under 125 characters for simple images where possible.
    *   Use clear, simple language. Avoid jargon unless it\'s part of transcribed text or essential to the meaning.
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

11. **Do Not\'s:**
    * Do not begin descriptions with generic phrases like "Image of...", "Video of...", etc., unless specifying the type as in Guideline 1.
    * Do not add external information, interpretations, or assumptions not directly represented in the visual media itself.
    * Do not repeat information already present in surrounding text content on the page.

By consistently applying these guidelines, you will create alt-text that is informative, accurate, concise where appropriate, and genuinely helpful for users of assistive technology across different types of visual media.`;
  
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
          const instructions = systemInstructions;
          
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
      port.onMessage.addListener(async (message: any) => { // Use any temporarily or define a specific interface for this message
        console.log('Port message received:', message);

        // --- START: Align with content script message format ---
        // Check for 'action' key instead of 'type', and access properties directly
        if (message.action === 'generateAltText' && message.imageUrl && typeof message.isVideo === 'boolean') {
          // const payload = message.payload as GenerateAltTextPayload; // No longer using payload
          console.log(`Port request: Generate alt text for ${message.imageUrl}, isVideo: ${message.isVideo}`);
          
          // Use the main generation function, fetching if necessary
          // Pass mimeTypeHint as undefined since we rely on the Data URL
          const result = await generateAltTextForMedia(message.imageUrl, message.isVideo, undefined);
        // --- END: Align with content script message format ---
          
          console.log('Sending result back via port:', result);
          try {
            port.postMessage(result); // Send {altText: ...} or {error: ...}
          } catch (postError: unknown) {
            console.error('Error posting message back via port:', postError);
          }
        } else {
          console.warn('Received unknown message format or action via port:', message);
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