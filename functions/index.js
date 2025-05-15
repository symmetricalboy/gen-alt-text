// index.js (for Google Cloud Functions - Node.js Runtime)
const functions = require('@google-cloud/functions-framework');
const fetch = require('node-fetch'); // Use node-fetch or native fetch in newer Node versions

// IMPORTANT: Store your API Key securely!
// Best Practice: Use Secret Manager (https://cloud.google.com/secret-manager)
// Good Practice: Use Build-time Environment Variables (set during deployment)
// Simpler (but less secure than Secret Manager): Use Runtime Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Will be set during deployment
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// --- Instructions for caption generation ---
const captionSystemInstructions = `You are an expert captioning service. Your task is to provide accurate captions for a video by transcribing its audio content. The captions should be properly formatted as WebVTT subtitles with timestamps.

Guidelines for your task:

1. Transcribe all spoken words and important audio elements.
2. Use appropriate WebVTT formatting.
3. Add timestamps that make sense for a video of the provided duration.
4. Keep each caption segment to a reasonable length (1-2 sentences maximum).
5. Include speaker identification when multiple people are speaking.
6. Include important sound effects or music in [brackets].
7. Ensure each caption segment has a reasonable duration (approximately 2-5 seconds).

Based on the video provided, please generate a complete WebVTT file that begins with "WEBVTT" and includes properly formatted captions with timestamps in the format HH:MM:SS.mmm --> HH:MM:SS.mmm.`;

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
    ...ALLOWED_LOCAL_ORIGINS,
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

1.  **Media Type Identification:**    *   Begin by identifying the type of media. For images, note if it is a "photograph", "painting", "illustration", "diagram", "screenshot", "comic panel", etc. For videos, simply describe the content directly without prefacing with "Video describing...".

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
            
            // Allow any extension origin (for debugging/development)
            // This is less secure but helps during development
            if (!originAllowed && (
                requestOrigin.startsWith('chrome-extension://') || 
                requestOrigin.startsWith('moz-extension://') || 
                requestOrigin.startsWith('safari-web-extension://')
            )) {
                console.log(`Allowing extension origin: ${requestOrigin}`);
                originAllowed = true;
                allowedOriginForCors = requestOrigin;
            }
        }
    }

    // !!! ADDED LOGGING HERE !!!
    console.log(`[CORS DEBUG] Request Origin: ${requestOrigin}, Allowed: ${originAllowed}, AllowedOriginForCors: ${allowedOriginForCors}`);

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
            res.set('Access-Control-Allow-Headers', 'Content-Type, Connection, Accept, Cache-Control');
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
        
        // Check if this is a caption generation request
        if (req.body.action === 'generateCaptions') {
            let { base64Data, mimeType, duration, transcriptId } = req.body; // Allow mimeType to be modified
            
            if (!base64Data || !mimeType) {
                return res.status(400).json({ error: 'Missing required fields: base64Data and mimeType' });
            }

            const originalMimeTypeForCaptions = mimeType;
            if (mimeType.includes(';')) {
                mimeType = mimeType.split(';')[0];
                console.log(`Cleaned mimeType for captions from "${originalMimeTypeForCaptions}" to: "${mimeType}"`);
            }
            
            if (!mimeType.startsWith('video/')) {
                return res.status(400).json({ error: `Invalid mime type for caption generation. Expected video/*, got "${mimeType}" (original: "${originalMimeTypeForCaptions}")` });
            }
            
            console.log(`Processing caption generation request for ${mimeType} (original: ${originalMimeTypeForCaptions}), data length: ${base64Data.length}, duration: ${duration || 'unknown'}, ID: ${transcriptId}`);
            
            // Prepare the caption request
            const videoDuration = duration || 60; // Default to 60 seconds if no duration provided
            
            // Add the duration to the instructions
            const instructionsWithDuration = `${captionSystemInstructions}\n\nThis video is approximately ${videoDuration} seconds long. Please create appropriate captions with timestamps that cover this duration.`;
            
            // Call Gemini API for caption generation
            const captionRequestBody = {
                contents: [{
                    parts: [
                        { text: instructionsWithDuration },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 4096, // Higher token limit for longer caption text
                    topP: 0.95,
                    topK: 40
                }
            };
            
            try {
                console.log('Calling Gemini API for caption generation...');
                const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(captionRequestBody)
                });
                
                const geminiData = await geminiResponse.json();
                
                if (!geminiResponse.ok) {
                    console.error('Gemini API Error in caption generation:', JSON.stringify(geminiData));
                    const errorMsg = geminiData?.error?.message || `Gemini API failed with status ${geminiResponse.status}`;
                    return res.status(geminiResponse.status >= 500 ? 502 : 400).json({ error: `Gemini API Error: ${errorMsg}` });
                }
                
                // Extract the generated captions
                const generatedCaptions = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (!generatedCaptions) {
                    console.error('Could not extract captions from Gemini response:', JSON.stringify(geminiData));
                    return res.status(500).json({ error: 'Failed to parse caption response from AI service' });
                }
                
                // Ensure we have a properly formatted WebVTT file
                let vttContent = generatedCaptions.trim();
                
                // Add WEBVTT header if not present
                if (!vttContent.startsWith('WEBVTT')) {
                    vttContent = `WEBVTT\n\n${vttContent}`;
                }
                
                console.log('Successfully generated captions.');
                return res.status(200).json({ vttContent: vttContent });
                
            } catch (error) {
                console.error('Error generating captions:', error);
                return res.status(500).json({ error: `Caption generation failed: ${error.message}` });
            }
        }
        
        if (req.body.action === 'getUploadUrl') {
            // Handle generating a signed upload URL
            const { mediaType, mimeType, fileSize, uploadId } = req.body;
            
            if (!mediaType || !mimeType || !fileSize || !uploadId) {
                return res.status(400).json({ error: 'Missing required fields for upload URL generation' });
            }
            
            // Check if file size is too large (20MB limit)
            const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
            if (fileSize > MAX_FILE_SIZE) {
                return res.status(413).json({ error: 'File too large. Maximum size is 20MB.' });
            }
            
            // For demo purposes, instead of actually generating a signed URL, we'll just return 
            // a simple URL with a dummy querystring that we'll recognize later.
            // In a real implementation, you'd use proper cloud storage signed URLs.
            console.log(`Generating upload URL for ${mediaType}, type ${mimeType}, size ${fileSize}, ID ${uploadId}`);
            
            // In a real implementation, you would generate a signed URL and store the uploadId
            // in some database or in-memory for later retrieval
            const uploadUrl = `https://example.com/upload-endpoint?id=${uploadId}`; // Placeholder
            
            return res.status(200).json({ 
                uploadUrl: uploadUrl,
                uploadId: uploadId 
            });
        }
        
        if (req.body.action === 'processUploadedMedia') {
            // Handle processing media that was uploaded directly
            const { uploadId, purpose } = req.body;
            const processPurpose = purpose || 'altText'; // Default to alt text if not specified
            
            if (!uploadId) {
                return res.status(400).json({ error: 'Missing required field: uploadId' });
            }
            
            // In a real implementation, you would retrieve the uploaded file using the uploadId
            // For this demo, we'll simulate processing with some placeholder content
            console.log(`Processing uploaded media with ID ${uploadId} for purpose: ${processPurpose}`);
            
            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (processPurpose === 'captions') {
                // Return dummy captions for demo purposes
                // In a real implementation, you would process the actual uploaded file
                const dummyVtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
[Music Playing]

00:00:05.000 --> 00:00:10.000
Hello, this is a sample caption for demonstration purposes.

00:00:10.000 --> 00:00:15.000
In a real implementation, we would analyze the actual video.`;

                return res.status(200).json({ vttContent: dummyVtt });
            } else {
                // Default to alt text
                return res.status(200).json({ 
                    altText: "This is a placeholder alt text for the uploaded media. In a real implementation, we would analyze the actual media that was uploaded." 
                });
            }
        }
        
        // Regular image/video alt text generation
        let { base64Data, mimeType } = req.body; // Allow mimeType to be modified

        if (!base64Data || !mimeType) {
            return res.status(400).json({ error: 'Missing required fields: base64Data and mimeType' });
        }
        if (typeof base64Data !== 'string' || typeof mimeType !== 'string') {
            return res.status(400).json({ error: 'Invalid data types for base64Data or mimeType' });
        }

        const originalMimeTypeForAltText = mimeType;
        if (mimeType.includes(';')) {
            mimeType = mimeType.split(';')[0];
            console.log(`Cleaned mimeType for alt text from "${originalMimeTypeForAltText}" to: "${mimeType}"`);
        }

        // Basic check for common image/video types - adjust as needed
        if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
             console.warn(`Received potentially unsupported mimeType: ${mimeType} (original: ${originalMimeTypeForAltText})`);
             // Allow it for now, Gemini might handle it, but consider stricter validation
        }

        // Get isVideo flag if present (helps with proper description prompting)
        const isVideo = req.body.isVideo === true;
        
        // Define animated image MIME types
        const animatedImageMimeTypes = ['image/gif', 'image/webp', 'image/apng'];
        const isAnimatedImage = animatedImageMimeTypes.includes(mimeType);

        // isVideoFrame is true if the client flagged it as video-related,
        // it's an image MIME type, BUT it's NOT one of the directly supported animated image types
        // (implying it's a frame extracted from a non-natively-animated-image video type).
        const isVideoFrame = isVideo && mimeType.startsWith('image/') && !isAnimatedImage;

        console.log(`Processing allowed request from origin: ${requestOrigin}, mimeType: ${mimeType} (original: ${originalMimeTypeForAltText}), data length: ${base64Data.length}, isVideo: ${isVideo}, isAnimatedImage: ${isAnimatedImage}, isVideoFrame: ${isVideoFrame}`);

        // Add special handling for video frames
        let effectiveSystemInstructions = systemInstructions;
        
        if (isVideoFrame) {
            // Add special instructions for when we're processing a video frame instead of the full video            effectiveSystemInstructions = `${systemInstructions}\n\nIMPORTANT ADDITIONAL CONTEXT: Due to technical limitations with processing large videos, you are being provided with a representative screenshot from the video rather than the full video file. Please describe this frame as thoroughly as possible, focusing on the visual content, and make it clear that this is describing a single moment from a video rather than the complete video content. Begin your description with "A frame from a video showing..." to clarify this limitation to the user.`;
        }

        // --- Call Gemini API ---
        let mimeTypeForGemini = mimeType; // Start with the (cleaned) original mimeType
        if (isVideo && isAnimatedImage) {
            // If the client flagged it as video-like (e.g., for Bluesky posting requirements)
            // AND it's one of our recognized animated image types (gif, animated webp, apng),
            // let's try sending a common video MIME type to Gemini.
            // The system instructions for animated images should still guide Gemini correctly.
            mimeTypeForGemini = 'video/mp4'; 
            console.log(`ALERT: For Gemini API call, overriding mimeType from "${mimeType}" to "${mimeTypeForGemini}" because isVideo=true and isAnimatedImage=true.`);
        }

        const geminiRequestBody = {
          contents: [{
            parts: [
              { text: effectiveSystemInstructions },
              { inline_data: { mime_type: mimeTypeForGemini, data: base64Data } } // Use mimeTypeForGemini
            ]
          }],
          generationConfig: {
            temperature: 0.2, // Lower temperature for more deterministic output
            maxOutputTokens: 2048, // Allow for longer descriptions if needed
            topP: 0.95,
            topK: 64
          }
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

        // For video frames, ensure the user knows this was an optimization
        let finalText = generatedText.trim();
        if (isVideoFrame && !finalText.toLowerCase().startsWith("a frame from a video")) {
            // Add a prefix if Gemini didn't use our suggested format
            finalText = "A frame from a video showing " + finalText.charAt(0).toLowerCase() + finalText.slice(1);
        }

        console.log('Successfully generated alt text for allowed origin.');
        // Send successful response back to the extension
        res.status(200).json({ altText: finalText });

    } catch (error) {
        console.error('Error processing request:', error);
        // Send generic server error back
        res.status(500).json({ error: error instanceof Error ? error.message : 'An internal server error occurred' });
    }
}); 