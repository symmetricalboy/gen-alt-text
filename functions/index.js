// index.js (for Google Cloud Functions - Node.js Runtime)
const functions = require('@google-cloud/functions-framework');
const fetch = require('node-fetch'); // Use node-fetch or native fetch in newer Node versions

// IMPORTANT: Store your API Key securely!
// Best Practice: Use Secret Manager (https://cloud.google.com/secret-manager)
// Good Practice: Use Build-time Environment Variables (set during deployment)
// Simpler (but less secure than Secret Manager): Use Runtime Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Will be set during deployment
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// --- !!! REPLACE WITH YOUR ACTUAL IDs !!! ---
const ALLOWED_CHROME_ORIGIN = 'chrome-extension://bdgpkmjnfildfjhpjagjibfnfpdieddp';
// Find this when you package your Safari extension via Xcode (e.g., com.yourcompany.yourextension)
// The exact Origin format might need testing, but it uses the bundle ID.
const ALLOWED_CHROME_ORIGIN_PREFIX = 'chrome-extension://';
const ALLOWED_SAFARI_ORIGIN_PREFIX = 'safari-web-extension://';
const ALLOWED_FIREFOX_ORIGIN_PREFIX = 'moz-extension://';
// Web app domains
const ALLOWED_WEB_APP_ORIGIN = 'https://alttext.symm.app';
// Local development origins
const ALLOWED_LOCAL_ORIGINS = [
    'http://localhost:8080',
    'http://localhost:3000', 
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000'
];
// ---

// List of fully allowed origins (for precise matching)
const allowedFullOrigins = [
    ALLOWED_CHROME_ORIGIN,
    ALLOWED_WEB_APP_ORIGIN,
    ...ALLOWED_LOCAL_ORIGINS
    // Add other specific origins if needed, e.g., for testing environments
];

// List of allowed prefixes (for matching start of the string)
const allowedPrefixes = [
    ALLOWED_CHROME_ORIGIN_PREFIX,
    ALLOWED_SAFARI_ORIGIN_PREFIX, // Check if Safari needs full ID or just prefix based on testing
    ALLOWED_FIREFOX_ORIGIN_PREFIX
];


// --- Copy your System Instructions here ---
// TODO: Add your actual system instructions back here if they are not included below
const systemInstructions = `You will be provided with visual media (either a still image or a video file). Your task is to generate alternative text (alt-text) that describes the media's content and context. This alt-text is intended for use with screen reader technology, assisting individuals who are blind or visually impaired to understand the visual information. Adhere to the following guidelines strictly:

1.  **Media Type Identification:**
    *   Begin by identifying the type of media. For images, note if it is a "photograph", "painting", "illustration", "diagram", "screenshot", "comic panel", etc. For videos, start the description with "Video describing...".

2.  **Content and Purpose:**
    *   Describe the visual content accurately and thoroughly. Explain the media in the context that it is presented.
    *   Convey the media's purpose. Why is this included? What information is it trying to present? What is the core message?
    *   Prioritize the most important information, placing it at the beginning of the alt-text.
    *   If the image serves a specific function (e.g., a button or a link), describe the function. Example: "Search button" or "Link to the homepage".

3.  **Video-Specific Instructions:**
    *   For standard videos, describe the key visual elements, actions, scenes, and any text overlays that appear throughout the *duration* of the video playback. Focus on conveying the narrative or informational flow presented visually. Do *not* just describe a single frame or thumbnail.
    *   **For short, looping animations (like animated GIFs or silent WebM files):** Describe the *complete action* or the *entire sequence* shown in the loop. Even if brief, explain what happens from the beginning to the end of the animation cycle. For example, instead of "A cat looking up", describe "Video showing a cat repeatedly looking up, raising its head, and then lowering it again in a loop."

4.  **Sequential Art (Comics/Webcomics):**
    *   For media containing sequential art like comic panels or webcomics, describe the narrative progression. Detail the actions, characters, settings, and dialogue/captions within each panel or across the sequence to tell the story visually represented.

5.  **Text within the Media:**
    *   If the media contains text (e.g., signs, labels, captions, text overlays in videos), transcribe the text *verbatim* within the alt-text. Indicate that this is a direct quote by using quotation marks. Example: 'A sign that reads, "Proceed with Caution".'
    *   **Crucially**, if the media consists primarily of a large block of text (e.g., a screenshot of an article, a quote graphic, a presentation slide), you MUST transcribe the *entire* text content verbatim, up to a practical limit (e.g., 2000 characters). Accuracy and completeness of the text take precedence over brevity in these cases.
    *   For screenshots containing User Interface (UI) elements, transcribe essential text (button labels, input field values, key menu items). Exercise judgment to omit minor or redundant UI text (tooltips, decorative labels) that doesn't significantly contribute to understanding the core function or state shown. Example: "Screenshot of a software settings window. The 'Notifications' tab is active, showing a checkbox labeled \"Enable desktop alerts\" which is checked."

6.  **Brevity and Clarity:**
    *   Keep descriptions concise *except* when transcribing significant amounts of text or describing sequential narratives (comics, videos), where clarity and completeness are more important. Aim for under 150 characters for simple images where possible.
    *   Use clear, simple language. Avoid jargon unless it's part of transcribed text or essential to the meaning.
    *   Use proper grammar, punctuation, and capitalization. End sentences with a period.

7.  **Notable Individuals:**
    *   If the media features recognizable people, identify them by name. If their role or title is relevant, include that too. Example: "Photograph of Dr. Jane Goodall observing chimpanzees."

8.  **Inappropriate or Sensitive Content:**
    *   If the media depicts potentially sensitive, offensive, or harmful content, maintain a professional, objective, and clinical tone.
    *   Describe the factual visual content accurately but avoid graphic or sensationalized language. Aim for a descriptive level appropriate for a general audience (e.g., PG-13).

9.  **Output Format:**
    *   Provide *only* the descriptive alt-text. Do *not* include introductory phrases (e.g., "The image shows...", "Alt-text:"), conversational filler, or follow-up statements. Output *just* the description.

10. **Do Not's:**
    * Do not begin descriptions with generic phrases like "Image of...", "Video of...", etc., unless specifying the type as in Guideline 1.
    * Do not add external information, interpretations, or assumptions not directly represented in the visual media itself.

By consistently applying these guidelines, you will create alt-text that is informative, accurate, concise where appropriate, and genuinely helpful for users of assistive technology across different types of visual media.`;
// ---


functions.http('generateAltTextProxy', async (req, res) => {
    const requestOrigin = req.headers.origin;
    let originAllowed = false;
    let allowedOriginForCors = null;

    // --- Origin Validation Logic ---
    if (requestOrigin) {
        // Check for exact match first
        if (allowedFullOrigins.includes(requestOrigin)) {
            originAllowed = true;
            allowedOriginForCors = requestOrigin;
        } else {
            // Check for prefix match if no exact match found
            for (const prefix of allowedPrefixes) {
                if (requestOrigin.startsWith(prefix)) {
                    originAllowed = true;
                    allowedOriginForCors = requestOrigin; // Reflect the specific requesting origin
                    break; // Stop checking prefixes once one matches
                }
            }
        }
    }

    // --- Set CORS Headers ---
    // Only set Allow-Origin if the request origin is actually allowed
    if (allowedOriginForCors) {
         res.set('Access-Control-Allow-Origin', allowedOriginForCors);
    }
    // Add Vary header to indicate response depends on Origin
    res.set('Vary', 'Origin');

    // --- Handle OPTIONS (preflight) requests ---
    if (req.method === 'OPTIONS') {
        if (originAllowed) {
            res.set('Access-Control-Allow-Methods', 'POST');
            res.set('Access-Control-Allow-Headers', 'Content-Type');
            res.set('Access-Control-Max-Age', '3600');
            res.status(204).send('');
        } else {
            // If origin isn't allowed, don't grant CORS preflight
            console.warn(`Rejected OPTIONS request from origin: ${requestOrigin || 'Not Specified'}`);
            res.status(403).send('Forbidden: Origin not allowed');
        }
        return;
    }

    // --- Reject if Origin Not Allowed ---
    if (!originAllowed) {
        console.warn(`Rejected POST request from origin: ${requestOrigin || 'Not Specified'}`);
        return res.status(403).send('Forbidden: Invalid Origin');
    }

    // --- Handle POST requests (if Origin is valid) ---
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // --- API Key Check ---
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY environment variable not set.");
        return res.status(500).json({ error: 'Server configuration error: API Key missing.' });
    }

    try {
        // --- Input Validation ---
        // Check if this is a special condensing request
        if (req.body.operation === 'condense_text') {
            if (!req.body.text || !req.body.directive || !req.body.targetLength) {
                return res.status(400).json({ error: 'Missing required fields for text condensation' });
            }
            
            console.log(`Processing text condensation request, targetLength: ${req.body.targetLength}, text length: ${req.body.text.length}`);
            
            // Call Gemini API for text condensation
            const condensingRequestBody = {
                contents: [{
                    parts: [
                        { text: req.body.directive },
                        { text: req.body.text }
                    ]
                }],
                generationConfig: {
                    temperature: 0.2, // Lower temperature for more deterministic output
                    maxOutputTokens: 1024 // Limit output size
                }
            };
            
            const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(condensingRequestBody)
            });
            
            const geminiData = await geminiResponse.json();
            
            if (!geminiResponse.ok) {
                console.error('Gemini API Error in text condensation:', JSON.stringify(geminiData));
                const errorMsg = geminiData?.error?.message || `Gemini API failed with status ${geminiResponse.status}`;
                return res.status(geminiResponse.status >= 500 ? 502 : 400).json({ error: `Gemini API Error: ${errorMsg}` });
            }
            
            const condensedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!condensedText) {
                console.error('Could not extract condensed text from Gemini response:', JSON.stringify(geminiData));
                return res.status(500).json({ error: 'Failed to parse response from AI service' });
            }
            
            console.log(`Successfully condensed text from ${req.body.text.length} to ${condensedText.length} characters`);
            return res.status(200).json({ altText: condensedText.trim() });
        }
        
        // Regular image/video alt text generation
        const { base64Data, mimeType } = req.body;
        if (!base64Data || !mimeType) {
            return res.status(400).json({ error: 'Missing required fields: base64Data and mimeType' });
        }
        if (typeof base64Data !== 'string' || typeof mimeType !== 'string') {
            return res.status(400).json({ error: 'Invalid data types for base64Data or mimeType' });
        }
        // Basic check for common image/video types - adjust as needed
        if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
             console.warn(`Received potentially unsupported mimeType: ${mimeType}`);
             // Allow it for now, Gemini might handle it, but consider stricter validation
        }


        console.log(`Processing allowed request from origin: ${requestOrigin}, mimeType: ${mimeType}, data length: ${base64Data.length}`);

        // --- Call Gemini API ---
        const geminiRequestBody = {
          contents: [{
            parts: [
              { text: systemInstructions },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }]
          // Add safetySettings or generationConfig if needed
          // safetySettings: [...]
          // generationConfig: {...}
        };

        console.log('Calling Gemini API...');
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiRequestBody)
        });

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
          console.error('Gemini API Error Response:', JSON.stringify(geminiData));
          const errorMsg = geminiData?.error?.message || `Gemini API failed with status ${geminiResponse.status}`;
          // Return a structured error that the extension can understand
          return res.status(geminiResponse.status >= 500 ? 502 : 400).json({ error: `Gemini API Error: ${errorMsg}` });
        }

        // --- Extract Text and Respond ---
        // Adjust path based on Gemini API version/response structure if needed
        const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
          console.error('Could not extract text from Gemini response:', JSON.stringify(geminiData));
          return res.status(500).json({ error: 'Failed to parse response from AI service' });
        }

        console.log('Successfully generated alt text for allowed origin.');
        // Send successful response back to the extension
        res.status(200).json({ altText: generatedText.trim() });

    } catch (error) {
        console.error('Error processing request:', error);
        // Send generic server error back
        res.status(500).json({ error: error instanceof Error ? error.message : 'An internal server error occurred' });
    }
}); 