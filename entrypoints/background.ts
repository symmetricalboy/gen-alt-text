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
  console.log('Bluesky Alt Text Generator background script loaded (Proxy Mode)');
  
  // Get Cloud Function URL from environment variables (set via wxt.config.ts)
  const CLOUD_FUNCTION_URL = import.meta.env.VITE_CLOUD_FUNCTION_URL;
  
  // Maximum length for alt text to avoid "Message length exceeded maximum allowed length" error
  const MAX_ALT_TEXT_LENGTH = 2000;

  // Hard limit for any text before we try to condense it
  const ABSOLUTE_MAX_LENGTH = 5000;
  
  // Max size for direct blob processing (in bytes)
  const MAX_DIRECT_BLOB_SIZE = 5 * 1024 * 1024; // 5MB
  
  if (!CLOUD_FUNCTION_URL || CLOUD_FUNCTION_URL === 'YOUR_FUNCTION_URL_HERE') {
    console.error(
      'VITE_CLOUD_FUNCTION_URL is not configured or is set to the placeholder value. ' +
      'Please deploy the Cloud Function and update the URL in wxt.config.ts then rebuild the extension.'
    );
    // Consider preventing listeners from attaching if URL is missing
  }
  
  // Interface for responses sent back via Port - ADD THIS
  type PortResponse = { altText: string } | { error: string };
  
  // 1. Add helper to convert Blob or URL to Data URL
  const blobToDataURL = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
  };

  // 2. Update getBase64Data to handle different source types (Data URL, HTTP URL)
  async function getBase64Data(source: string, isLargeVideo: boolean = false): Promise<{ base64Data: string; mimeType: string }> {
      if (source.startsWith('data:')) {
          console.log('[getBase64Data] Source is Data URL, extracting...');
          const parts = source.match(/^data:(.+?);base64,(.*)$/);
          if (!parts || parts.length < 3) {
              console.error('[getBase64Data] Invalid Data URL format received:', source.substring(0, 100) + '...');
              throw new Error('Invalid Data URL format received');
          }
          const mimeType = parts[1];
          const base64Data = parts[2];
          if (!mimeType.includes('/') || !base64Data) {
              throw new Error('Extracted mimeType or base64 data appears invalid.');
          }
          return { base64Data, mimeType };
      } else if (source.startsWith('http:') || source.startsWith('https:')) {
          console.log('[getBase64Data] Source is HTTP(S) URL, fetching...', source);
          try {
              const response = await fetch(source);
              if (!response.ok) {
                  throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
              }
              
              const blob = await response.blob();
              console.log(`[getBase64Data] Fetched blob of size: ${blob.size} bytes, type: ${blob.type}`);
              
              // Add an optimization for large videos
              if (isLargeVideo || blob.size > MAX_DIRECT_BLOB_SIZE) {
                  console.log('[getBase64Data] Large media detected, using optimized processing');
                  const mimeType = blob.type;
                  
                  // For large videos, get a better frame sample instead of the full video
                  if (mimeType.startsWith('video/')) {
                      console.log('[getBase64Data] Processing large video with optimized method');
                      return await optimizedVideoProcessing(blob, mimeType);
                  }
              }
              
              const dataUrl = await blobToDataURL(blob);
              console.log('[getBase64Data] Successfully fetched and converted URL to Data URL.');
              // Re-run with the dataUrl to extract parts
              return await getBase64Data(dataUrl);
          } catch (fetchError) {
              console.error('[getBase64Data] Error fetching or converting URL:', fetchError);
              throw new Error(`Failed to fetch or process media URL: ${fetchError instanceof Error ? fetchError.message : fetchError}`);
          }
      } else if (source.startsWith('blob:')) {
          console.log('[getBase64Data] Source is Blob URL, fetching...', source);
          try {
              const response = await fetch(source);
              if (!response.ok) {
                  throw new Error(`Failed to fetch blob URL: ${response.status} ${response.statusText}`);
              }
              
              const blob = await response.blob();
              console.log(`[getBase64Data] Fetched blob of size: ${blob.size} bytes, type: ${blob.type}`);
              
              // Add an optimization for large videos
              if (isLargeVideo || blob.size > MAX_DIRECT_BLOB_SIZE) {
                  console.log('[getBase64Data] Large media detected, using optimized processing');
                  const mimeType = blob.type;
                  
                  // For large videos, get a better frame sample instead of the full video
                  if (mimeType.startsWith('video/')) {
                      console.log('[getBase64Data] Processing large video with optimized method');
                      return await optimizedVideoProcessing(blob, mimeType);
                  }
              }
              
              const dataUrl = await blobToDataURL(blob);
              console.log('[getBase64Data] Successfully fetched and converted blob URL to Data URL.');
              // Re-run with the dataUrl to extract parts
              return await getBase64Data(dataUrl);
          } catch (fetchError) {
              console.error('[getBase64Data] Error fetching or converting blob URL:', fetchError);
              throw new Error(`Failed to fetch or process blob URL: ${fetchError instanceof Error ? fetchError.message : fetchError}`);
          }
      } else {
          console.error('[getBase64Data] ERROR: Received unsupported source type:', source.substring(0, 100) + '...');
          throw new Error('Background script received an unsupported source type.');
      }
  }
  
  // Helper function to optimize video processing by extracting frames
  async function optimizedVideoProcessing(videoBlob: Blob, mimeType: string): Promise<{ base64Data: string; mimeType: string }> {
      return new Promise((resolve, reject) => {
          try {
              // Create a video element to load the blob
              const video = document.createElement('video');
              video.muted = true;
              video.autoplay = false;
              video.controls = false;
              
              // Create object URL from the blob
              const objectUrl = URL.createObjectURL(videoBlob);
              
              // Set up event handlers
              video.onloadedmetadata = () => {
                  console.log(`[optimizedVideoProcessing] Video metadata loaded: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration}s`);
                  
                  // Seek to 20% into the video for a representative frame
                  const seekTime = Math.min(video.duration * 0.2, 3); // 20% or 3 seconds, whichever is less
                  video.currentTime = seekTime;
              };
              
              video.onseeked = () => {
                  try {
                      // Create canvas to capture the frame
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      
                      if (!ctx) {
                          throw new Error('Failed to get canvas 2D context');
                      }
                      
                      // Set canvas size to match video dimensions
                      canvas.width = video.videoWidth;
                      canvas.height = video.videoHeight;
                      
                      // Draw the current video frame to the canvas
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      
                      // Get the data URL from the canvas (this is a JPEG frame from the video)
                      const frameDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                      
                      // Clean up
                      URL.revokeObjectURL(objectUrl);
                      
                      // Extract base64 data from data URL
                      const base64Match = frameDataUrl.match(/^data:(.+?);base64,(.*)$/);
                      if (!base64Match || base64Match.length < 3) {
                          throw new Error('Failed to extract base64 data from frame');
                      }
                      
                      // Return the frame data instead of the full video
                      resolve({
                          base64Data: base64Match[2],
                          mimeType: base64Match[1], // This will be image/jpeg
                      });
                      
                      console.log('[optimizedVideoProcessing] Successfully extracted and processed video frame');
                  } catch (frameError) {
                      console.error('[optimizedVideoProcessing] Error extracting frame:', frameError);
                      reject(frameError);
                  }
              };
              
              video.onerror = (e) => {
                  console.error('[optimizedVideoProcessing] Error loading video:', e);
                  URL.revokeObjectURL(objectUrl);
                  reject(new Error('Failed to load video for processing'));
              };
              
              // Start loading the video
              video.src = objectUrl;
              
          } catch (setupError) {
              console.error('[optimizedVideoProcessing] Setup error:', setupError);
              reject(setupError);
          }
      });
  }

  // --- Alt Text Generation Logic (Modified to call Proxy) ---
  async function generateAltTextViaProxy(
    source: string, // Expecting Data URL from content script
    isVideo: boolean, // Keep this, might be useful later
    isLargeVideo: boolean = false // New flag for optimized processing
  ): Promise<PortResponse> { // Return type matches PortResponse
      if (!CLOUD_FUNCTION_URL || CLOUD_FUNCTION_URL === 'YOUR_FUNCTION_URL_HERE') {
          console.error('Cannot generate alt text: Cloud Function URL is not configured.');
          return { error: 'Extension configuration error: Proxy URL not set.' };
      }

      try {
        // 1. Get Base64 data and final mime type
        const { base64Data, mimeType } = await getBase64Data(source, isLargeVideo);
        console.log(`Sending request to proxy for ${mimeType}`);

        // Check if this is a potentially problematic large video
        const isLargeData = base64Data.length > 1000000; // Over 1MB of base64 data
        if (isVideo && isLargeData) {
          console.warn('Large video detected, this may result in a very long description');
        }

        // 2. Prepare request body for the Cloud Function Proxy
        const proxyRequestBody = {
            base64Data: base64Data,
            mimeType: mimeType,
            isVideo: isVideo // Now sending this to allow backend to optimize for videos
        };

        // 3. Call the Cloud Function Proxy
        const proxyResponse = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Origin header is automatically set by the browser
            },
            body: JSON.stringify(proxyRequestBody)
        });

        // 4. Handle the Response
        const responseData = await proxyResponse.json(); // Always try to parse JSON

        if (!proxyResponse.ok) {
            console.error('Proxy function returned an error:', proxyResponse.status, responseData);
            const errorMsg = responseData?.error || proxyResponse.statusText || `Proxy request failed with status ${proxyResponse.status}`;
            return { error: `AI Proxy Error: ${errorMsg}` };
        }

        if (responseData && typeof responseData.altText === 'string') {
            // console.log('Received alt text from proxy:', responseData.altText);
            
            let altText = responseData.altText;
            
            // Check if text exceeds the maximum length
            if (altText.length > MAX_ALT_TEXT_LENGTH) {
              console.warn(`Alt text exceeds maximum length (${altText.length} > ${MAX_ALT_TEXT_LENGTH}), condensing instead of truncating...`);
              
              // Use Gemini to condense the text instead of truncating
              altText = await condenseAltText(altText, isVideo);
              
              // Add a note if the text was condensed
              if (isVideo) {
                const condensedNote = "[Note: This video description was automatically condensed to fit character limits.]\n\n";
                // Only add the note if there's room for it
                if (altText.length + condensedNote.length <= MAX_ALT_TEXT_LENGTH) {
                  altText = condensedNote + altText;
                }
              }
            }
            
            return { altText: altText };
        } else {
            console.error('Unexpected successful response format from proxy:', responseData);
            return { error: 'Received invalid response format from proxy service.' };
        }

      } catch (error: unknown) {
          console.error('Error calling alt text proxy:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error communicating with proxy';
          return { error: `Network/Request Error: ${errorMessage}` };
      }
  }
  
  // --- Listener for Port Connections (from content script button click) ---
  browser.runtime.onConnect.addListener((port) => {
    // console.log(`Port connected: ${port.name}`, port.sender);

    if (port.name === "altTextGenerator") {
      port.onMessage.addListener(async (message: any) => { // Use any for now, validated below
        // console.log('Port message received:', message);

        // --- START: Updated validation & calling proxy ---
        // Validate incoming message structure (accepts mediaUrl now)
        if (message && message.action === 'generateAltText' && typeof message.mediaUrl === 'string' && typeof message.isVideo === 'boolean') {
          console.log(`Port request: Generate alt text for ${message.mediaUrl.substring(0,60)}..., isVideo: ${message.isVideo}`);
          
          // Extract isLargeVideo flag if present
          const isLargeVideo = !!message.isLargeVideo;
          if (isLargeVideo) {
            console.log('Message indicates this is a large video, will use optimized processing');
          }
          
          // *** Call the updated proxy function (which now handles URL fetching) ***
          const result: PortResponse = await generateAltTextViaProxy(message.mediaUrl, message.isVideo, isLargeVideo);
          // --- END: Updated validation & calling proxy ---
          
          console.log('Sending result back via port:', result);
          try {
            // Only post message if the port is still connected
            if (port) { 
                port.postMessage(result); // Send {altText: ...} or {error: ...}
            } else {
                 console.warn("Port disconnected before response could be sent.");
            }
          } catch (postError: unknown) {
            // Handle cases where the port might disconnect just before posting
            console.error('Error posting message back via port (port might have disconnected):', postError);
          }
        } else {
          console.warn('Received unknown or invalid message format via port:', message);
        }
      });

      port.onDisconnect.addListener(() => {
         console.log(`Port ${port.name} disconnected.`);
         // No explicit cleanup needed here
      });
    } else {
        console.warn(`Unexpected port connection ignored: ${port.name}`);
    }
  });
  
  // --- Listener for General Messages (like MEDIA_INTERCEPTED) ---
  // !! Modified to disable automatic processing for now !!
  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    // console.log('General message received:', message?.type, 'from:', sender?.tab?.id || sender?.id);

    if (message?.type === 'MEDIA_INTERCEPTED') {
        console.log('MEDIA_INTERCEPTED received, but auto-processing via proxy is currently disabled.');
        // --- TODO: Decide if/when to trigger generation for intercepted media --- 
        // If you want to automatically generate, call generateAltTextViaProxy here:
        // const payload = message.payload as InterceptedMediaPayload;
        // const isVideo = payload.filetype.startsWith('video/');
        // generateAltTextViaProxy(payload.dataUrl, isVideo).then(result => {
        //    console.log('Auto-generated result for intercepted media:', result);
        //    // Decide what to do with the result (e.g., send to content script, store)
        // });
        sendResponse({ status: 'Intercepted (auto-processing disabled)'});
        return false; // Indicate sync response
    } else {
        console.log('Ignoring unknown general message type:', message?.type);
        return false; // Indicate sync response, not handling this message
    }
    // No async work started, so return false
    // return true; // Only return true if you intend to call sendResponse asynchronously
  });

  // Function to condense alt text by making another API call to Gemini
  async function condenseAltText(originalText: string, isVideo: boolean): Promise<string> {
    if (!CLOUD_FUNCTION_URL) {
      console.error('Cannot condense alt text: Cloud Function URL is not configured.');
      return originalText.substring(0, MAX_ALT_TEXT_LENGTH - 3) + '...';
    }

    try {
      // Create a directive for Gemini to condense the text to the target length
      const targetLength = MAX_ALT_TEXT_LENGTH - 100; // Leave some buffer space
      const mediaType = isVideo ? "video" : "image";
      const directive = `You are an expert at writing concise, informative alt text. Please condense the following ${mediaType} description to be no more than ${targetLength} characters while preserving the most important details. The description needs to be accessible and useful for screen readers:`;
      
      // Truncate the original text if it's extremely long to prevent message size issues
      const safeOriginalText = originalText.length > ABSOLUTE_MAX_LENGTH 
        ? originalText.substring(0, ABSOLUTE_MAX_LENGTH - 100) + "... [content truncated for processing]" 
        : originalText;

      // Create a special request for the condensing operation
      const condensingRequest = {
        operation: "condense_text",
        directive: directive,
        text: safeOriginalText,
        targetLength: targetLength
      };

      // Call the Cloud Function with this special request
      const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(condensingRequest)
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.altText) {
        console.error('Failed to condense alt text:', responseData);
        // Fall back to truncation if condensing fails
        return originalText.substring(0, MAX_ALT_TEXT_LENGTH - 3) + '...';
      }

      return responseData.altText;
    } catch (error) {
      console.error('Error condensing alt text:', error);
      // Fall back to truncation if condensing fails
      return originalText.substring(0, MAX_ALT_TEXT_LENGTH - 3) + '...';
    }
  }

  console.log('Background script proxy mode event listeners attached.');
}); 