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
