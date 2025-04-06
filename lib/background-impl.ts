// Background script implementation logic

import { AltTextResponse, GenerateAltTextRequest } from '../types';

// Read API key from environment variables
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Background message handler
export async function handleGenerateAltText(
  message: GenerateAltTextRequest
): Promise<AltTextResponse> {
  console.log('Processing alt text generation for:', message.imageUrl);

  if (!GEMINI_API_KEY) {
    console.error('Gemini API key not configured.');
    return { type: 'ALT_TEXT_RESULT', error: 'API key not configured.' };
  }

  try {
    // 1. Fetch the image data as base64
    const response = await fetch(message.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const blob = await response.blob();
    const base64Image = await blobToBase64(blob);
    const mimeType = blob.type;
    console.log('Image fetched and converted to base64.');

    // 2. Call Gemini API
    const geminiRequestBody = {
      contents: [
        {
          parts: [
            { text: "Describe this image for visually impaired users. Be concise and focus on the main subject and context. This will be used as image alt text." },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }
      ]
    };

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiRequestBody)
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.statusText} - ${errorBody}`);
    }

    const geminiResult = await geminiResponse.json();
    console.log('Gemini API response received.');

    // Extract the text
    const generatedText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('Could not extract text from Gemini response.');
    }

    return { type: 'ALT_TEXT_RESULT', text: generatedText.trim() };

  } catch (error: any) {
    console.error('Error processing alt text request:', error);
    return { type: 'ALT_TEXT_RESULT', error: error.message };
  }
}

// Helper function to convert Blob to Base64
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        resolve(reader.result.split(',', 2)[1]);
      } else {
        reject(new Error('Failed to read blob as base64 string'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
} 