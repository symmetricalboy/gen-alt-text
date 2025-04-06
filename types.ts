// Shared type definitions

export interface GenerateAltTextRequest {
  type: 'GENERATE_ALT_TEXT';
  imageUrl: string;
}

export interface AltTextResponse {
  type: 'ALT_TEXT_RESULT';
  text?: string;
  error?: string;
} 