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
  
  // Listen for connections from content scripts
  chrome.runtime.onConnect.addListener((port) => {
    console.log(`Connection established from ${port.sender?.tab?.id ? 'tab ' + port.sender.tab.id : 'unknown source'}, name: ${port.name}`);

    // Make sure it's our expected connection
    if (port.name === "altTextGenerator") {
      // Add a listener *for this specific port*
      port.onMessage.addListener(async (message) => {
        console.log('Message received via port:', message);

        if (message.action === 'generateAltText') { 
          let responsePayload = {}; // Define response payload
          try {
            console.log('Received alt text generation request for media:', message.imageUrl);
            console.log('Is video?', message.isVideo);
            
            // 1. Fetch the image
            const fetchResponse = await fetch(message.imageUrl);
            if (!fetchResponse.ok) {
              throw new Error(`Failed to fetch media: ${fetchResponse.statusText}`);
            }
            const blob = await fetchResponse.blob();
            const base64Image = await blobToBase64(blob);
            const mimeType = blob.type;
            console.log('Media fetched and converted to base64');
            
            // 2. Call Gemini API with appropriate instructions based on media type
            const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
            const geminiRequestBody = {
              contents: [{
                parts: [
                  // Use the appropriate instructions based on media type
                  { text: message.isVideo ? videoInstructions : imageInstructions }, 
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Image
                    }
                  }
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
              throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
            }
            
            const geminiData = await geminiResponse.json();
            console.log('Gemini API response received. Data:', JSON.stringify(geminiData));
            
            const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            console.log('Extracted text:', generatedText);
            
            if (!generatedText) {
              console.error('Generated text is missing from Gemini response.');
              throw new Error('Could not extract text from Gemini response');
            }
            
            // Prepare success response
            responsePayload = { altText: generatedText.trim() };
            console.log('Prepared successful response:', responsePayload);
            
          } catch (error) {
            console.error('Error caught in alt text generation process:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            // Prepare error response
            responsePayload = { error: errorMessage };
             console.log('Prepared error response:', responsePayload);
          }

          // Send the response back via the same port
          if (port) { // Check if port still exists
             console.log('Attempting to post response message via port:', responsePayload);
             try {
                port.postMessage(responsePayload);
                console.log('Successfully posted message via port.');
             } catch (postError) {
                console.error('Error posting message back via port:', postError, ' Port disconnected?');
             }
          } else {
            console.error('Port was disconnected before response could be sent.');
          }

        } else {
          console.warn('Received unknown action via port:', message.action);
          // Optionally send back an error for unknown actions
          // port.postMessage({ error: `Unknown action: ${message.action}` });
        }
      }); // End of port.onMessage listener

      // Optional: Handle disconnection from the content script side
      port.onDisconnect.addListener(() => {
         console.log(`Port ${port.name} disconnected.`);
         // Clean up any resources associated with this specific port if necessary
      });

    } // End if port.name === "altTextGenerator"
  }); // End of chrome.runtime.onConnect listener
  
  // Helper function to convert blob to base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}); 