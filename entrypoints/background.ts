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
              
              // Process all videos in full
              console.log(`[getBase64Data] Processing full media file (size: ${(blob.size / (1024 * 1024)).toFixed(2)}MB)`);
              
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
              
              // Process all videos in full
              console.log(`[getBase64Data] Processing full media file (size: ${(blob.size / (1024 * 1024)).toFixed(2)}MB)`);
              
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
      try {
          console.log(`[optimizedVideoProcessing] Processing full video of size: ${videoBlob.size / (1024 * 1024).toFixed(2)}MB`);
          
          // Convert the blob to base64 directly
          const dataUrl = await blobToDataURL(videoBlob);
          
          // Extract the base64 data
          const parts = dataUrl.match(/^data:(.+?);base64,(.*)$/);
          if (!parts || parts.length < 3) {
              throw new Error('Failed to extract base64 data from video blob');
          }
          
          return {
              base64Data: parts[2],
              mimeType: parts[1]
          };
      } catch (error) {
          console.error('[optimizedVideoProcessing] Error processing video:', error);
          throw error;
      }
  }

  // --- Alt Text Generation Logic (Modified to call Proxy) ---
  async function generateAltTextViaProxy(
    source: string, // Expecting Data URL from content script
    isVideo: boolean, // Keep this, might be useful later
    isLargeVideo: boolean = false // Flag for handling large videos
  ): Promise<PortResponse> { // Return type matches PortResponse
      if (!CLOUD_FUNCTION_URL || CLOUD_FUNCTION_URL === 'YOUR_FUNCTION_URL_HERE') {
          console.error('Cannot generate alt text: Cloud Function URL is not configured.');
          return { error: 'Extension configuration error: Proxy URL not set.' };
      }

      try {
        // 1. Get Base64 data and final mime type
        const { base64Data, mimeType } = await getBase64Data(source, isLargeVideo);
        console.log(`Sending request to proxy for ${mimeType}, data size: ${(base64Data.length / (1024 * 1024)).toFixed(2)}MB`);

        // Check if this is a large data source
        const isLargeData = base64Data.length > 1000000; // Over 1MB of base64 data
        if (isVideo && isLargeData) {
          console.log(`Processing large video data (${(base64Data.length / (1024 * 1024)).toFixed(2)}MB)`);
        }

        // 2. Prepare request body for the Cloud Function Proxy
        const proxyRequestBody = {
            base64Data: base64Data,
            mimeType: mimeType,
            isVideo: isVideo, 
            fileName: "file." + (mimeType.split('/')[1] || (isVideo ? "mp4" : "jpg")),
            fileSize: base64Data.length // File size based on base64 length
        };

        // Set appropriate timeout based on file size
        const timeoutDuration = base64Data.length > 4000000 ? 300000 : 180000; // 5 min for larger files, 3 min for smaller
        
        // 3. Call the Cloud Function Proxy with proper timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
        
        try {
          console.log('Sending request to Cloud Function:', CLOUD_FUNCTION_URL);
          const proxyResponse = await fetch(CLOUD_FUNCTION_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(proxyRequestBody),
              signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          // 4. Handle the Response
          if (!proxyResponse.ok) {
            console.error('Proxy function returned an error:', proxyResponse.status, proxyResponse.statusText);
            let errorMsg = '';
            
            // Handle specific HTTP status codes
            if (proxyResponse.status === 403) {
              errorMsg = 'Access denied by the server. This is likely a CORS (Cross-Origin Resource Sharing) issue. The server needs to allow this extension to connect to it.';
              console.error('CORS issue detected: 403 Forbidden response from Cloud Function');
            } else {
              try {
                const responseData = await proxyResponse.json();
                errorMsg = responseData?.error || proxyResponse.statusText || `Proxy request failed with status ${proxyResponse.status}`;
              } catch (jsonError) {
                errorMsg = `Request failed (${proxyResponse.status}): ${proxyResponse.statusText}`;
              }
            }
            
            return { error: errorMsg };
          }
          
          const responseData = await proxyResponse.json();

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
        } catch (e) {
          clearTimeout(timeoutId);
          if (e.name === 'AbortError') {
            return { error: 'Request timed out after several minutes. The video may be too complex to process.' };
          }
          throw e; // Re-throw for the outer catch block
        }
      } catch (error: unknown) {
          console.error('Error calling alt text proxy:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error communicating with proxy';
          return { error: `Network/Request Error: ${errorMessage}` };
      }
  }
  
  // --- Listener for Port Connections (from content script button click) ---
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === "altTextGenerator") {
      port.onMessage.addListener(async (message: any) => {
        // Handle large media direct upload flow
        if (message && message.action === 'directUploadLargeMedia') {
          console.log(`Port request: Direct upload flow for large ${message.mediaType}, size: ${(message.fileSize / (1024 * 1024)).toFixed(2)}MB`);
          
          try {
            // Generate a unique ID for this upload
            const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            
            // Get a temporary upload URL from the server
            const uploadRequest = {
              action: 'getUploadUrl',
              mediaType: message.mediaType,
              mimeType: message.mimeType,
              fileSize: message.fileSize,
              uploadId: uploadId
            };
            
            // Request a direct upload URL from the server
            console.log('Requesting direct upload URL from proxy service...');
            const uploadUrlResponse = await fetch(CLOUD_FUNCTION_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(uploadRequest)
            });
            
            if (!uploadUrlResponse.ok) {
              const errorMessage = await uploadUrlResponse.text().catch(() => null);
              console.error('Failed to get upload URL:', uploadUrlResponse.status, errorMessage);
              
              // Provide more specific error messages based on status code
              if (uploadUrlResponse.status === 400) {
                throw new Error(`Failed to get upload URL: 400 - File may exceed size limits or format not supported`);
              } else if (uploadUrlResponse.status === 413) {
                throw new Error(`Failed to get upload URL: 413 - File too large, please use a smaller video`);
              } else {
                throw new Error(`Failed to get upload URL: ${uploadUrlResponse.status} ${errorMessage ? '- ' + errorMessage : ''}`);
              }
            }
            
            const uploadUrlData = await uploadUrlResponse.json();
            
            if (!uploadUrlData.uploadUrl) {
              throw new Error('Server did not provide an upload URL');
            }
            
            // Send the upload URL back to the content script
            port.postMessage({
              uploadUrl: uploadUrlData.uploadUrl,
              uploadId: uploadId
            });
            
            // Wait for confirmation that the upload is complete
            return; // This listener will continue processing next messages
          } catch (error) {
            console.error('Error setting up direct upload:', error);
            port.postMessage({ 
              error: `Error setting up direct upload: ${error.message}` 
            });
          }
        } 
        
        // Handle notification that a direct upload is complete
        else if (message && message.action === 'mediaUploadComplete') {
          console.log(`Media upload complete for ID: ${message.uploadId}`);
          
          try {
            // Process the uploaded file with the proxy service
            const processRequest = {
              action: 'processUploadedMedia',
              uploadId: message.uploadId,
              purpose: message.purpose || 'altText' // Add purpose parameter
            };
            
            // Call the proxy function to process the uploaded media
            const processResponse = await fetch(CLOUD_FUNCTION_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(processRequest)
            });
            
            if (!processResponse.ok) {
              throw new Error(`Failed to process uploaded media: ${processResponse.status}`);
            }
            
            const processData = await processResponse.json();
            
            if (processData.altText) {
              // Send the result back to the content script
              port.postMessage({ altText: processData.altText });
            } else {
              throw new Error('No alt text received from server');
            }
          } catch (error) {
            console.error('Error processing uploaded media:', error);
            port.postMessage({ 
              error: `Error processing media: ${error.message}` 
            });
          }
        }
        
        // Standard flow for direct media URL handling
        else if (message && message.action === 'generateAltText' && typeof message.mediaUrl === 'string' && typeof message.isVideo === 'boolean') {
          console.log(`Port request: Generate alt text for ${message.mediaUrl.substring(0,60)}..., isVideo: ${message.isVideo}`);
          
          // Extract data about the file size if available
          const fileSize = message.fileSize || message.mediaUrl.length;
          const isLargeVideo = message.isVideo && fileSize > 1000000; // Over 1MB
          
          if (isLargeVideo) {
            console.log(`Processing large video (estimated size: ${(fileSize / (1024 * 1024)).toFixed(2)}MB)`);
          }
          
          // Call the proxy function
          const result: PortResponse = await generateAltTextViaProxy(message.mediaUrl, message.isVideo, isLargeVideo);
          
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
    } else if (port.name === "captionGenerator") {
      port.onMessage.addListener(async (message: any) => {
        if (message && message.action === 'generateCaptions' && typeof message.mediaUrl === 'string') {
          console.log(`Port request: Generate captions for video, duration: ${message.duration}s`);
          
          try {
            // Generate a unique ID for this transcription
            const transcriptId = `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            
            // Get the video data
            const { base64Data, mimeType } = await getBase64Data(message.mediaUrl);
            console.log(`Processed video for captioning, mime type: ${mimeType}, size: ${(base64Data.length / (1024 * 1024)).toFixed(2)}MB`);
            
            // Check if file is too large
            if (base64Data.length > 20 * 1024 * 1024) { // 20MB limit
              console.error('Video too large for caption generation');
              port.postMessage({ 
                error: 'Video too large for captions (maximum 20MB). Please use a smaller video.'
              });
              return;
            }
            
            // Prepare the request payload
            const transcriptionRequest = {
              action: 'generateCaptions',
              base64Data: base64Data,
              mimeType: mimeType,
              duration: message.duration || 0,
              transcriptId: transcriptId
            };
            
            // Set timeout for the request
            const timeoutDuration = 300000; // 5 minutes for transcription
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
            
            try {
              // Call the proxy service
              console.log('Requesting captions from proxy service...');
              const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(transcriptionRequest),
                signal: controller.signal
              });
              
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                console.error('Caption generation error:', response.status);
                
                // Handle specific HTTP status codes
                if (response.status === 403) {
                  console.error('CORS issue detected: 403 Forbidden response from Cloud Function');
                  port.postMessage({ 
                    error: 'Access denied by the server. This is likely a CORS issue. The server needs to allow this extension to connect to it.'
                  });
                  return;
                }
                
                // For other errors, try to get more details
                try {
                  const errorData = await response.json();
                  throw new Error(errorData.error || `Failed to generate captions: ${response.status} - ${response.statusText}`);
                } catch (jsonError) {
                  throw new Error(`Failed to generate captions: ${response.status} - ${response.statusText}`);
                }
              }
              
              const data = await response.json();
              
              if (data && data.vttContent) {
                console.log('Successfully generated captions');
                port.postMessage({ vttContent: data.vttContent });
              } else {
                throw new Error('No caption data received from server');
              }
            } catch (fetchError) {
              clearTimeout(timeoutId);
              console.error('Error calling caption service:', fetchError);
              
              if (fetchError.name === 'AbortError') {
                port.postMessage({ 
                  error: 'Request timed out. The video may be too complex to process.'
                });
              } else {
                port.postMessage({ 
                  error: `Error generating captions: ${fetchError.message}`
                });
              }
            }
          } catch (error) {
            console.error('Error processing caption request:', error);
            port.postMessage({ 
              error: `Error processing video: ${error.message}`
            });
          }
        } else {
          console.warn('Received unknown caption message format:', message);
          port.postMessage({ 
            error: 'Invalid caption request format'
          });
        }
      });
      
      port.onDisconnect.addListener(() => {
        console.log(`Port ${port.name} disconnected.`);
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