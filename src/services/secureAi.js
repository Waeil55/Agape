import { functions, httpsCallable } from '../config/firebase';

const generateEnterpriseAi = httpsCallable(functions, 'enterpriseAiGenerate', { timeout: 120000 });

export async function generateAiText(prompt, options = {}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('AI prompt is empty.');
  const result = await generateEnterpriseAi({
    prompt: cleanPrompt,
    temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.1,
    maxOutputTokens: Number.isFinite(Number(options.maxOutputTokens)) ? Number(options.maxOutputTokens) : 8192,
  });
  const text = String(result?.data?.text || '').trim();
  if (!text) throw new Error('The secure AI service returned no output.');
  return text;
}

export const secureGenerativeModel = {
  async generateContent(prompt) {
    const text = await generateAiText(prompt);
    return { response: { text: () => text } };
  },
};

// =============================================================================
// generateAiTextWithImage — vision extraction for trip-sheet photos
//
// Used by FileUploadTrips "Scan photo" / "Upload from photos". The image must
// be a compressed data URL (see compressTripPhoto in photoTripExtraction.js).
// Photos are used for extraction ONLY and are never persisted to Firestore or
// Storage by this call. Results MUST be shown in the review table for human
// verification — never auto-imported.
// Fail closed: rejects empty prompts, non-image data URLs, and payloads over
// ~3MB base64 before any network call.
// =============================================================================
export async function generateAiTextWithImage(prompt, imageDataUrl, options = {}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('AI prompt is empty.');
  const match = String(imageDataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('AI image must be a JPEG, PNG, or WebP data URL.');
  const [, mimeType, b64] = match;
  if (!b64 || b64.length > 4_000_000) throw new Error('AI image is missing or oversized. Retake with a smaller photo.');
  const result = await generateEnterpriseAi({
    prompt: cleanPrompt,
    image: { mimeType, data: b64 },
    temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.1,
    maxOutputTokens: Number.isFinite(Number(options.maxOutputTokens)) ? Number(options.maxOutputTokens) : 8192,
  });
  const text = String(result?.data?.text || '').trim();
  if (!text) throw new Error('The secure AI service returned no output.');
  return text;
}
