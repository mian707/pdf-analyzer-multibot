import { GoogleGenAI } from '@google/genai';
import type { ExtractionProvider } from './types';
import { cleanJson, MAX_OUTPUT_TOKENS } from './util';

export const geminiProvider: ExtractionProvider = {
  schemaFlavor: 'gemini',
  async run({ prompt, schema, pdfBase64, mimeType, model, apiKey }) {
    if (!apiKey) throw new Error('Gemini API key is not set (GEMINI_API_KEY in .env.local).');
    const ai = new GoogleGenAI({ apiKey });
    const parts: any[] = [];
    if (pdfBase64) parts.push({ inlineData: { data: pdfBase64, mimeType: mimeType || 'application/pdf' } });
    parts.push({ text: prompt });
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        maxOutputTokens: MAX_OUTPUT_TOKENS, // same cap as OpenAI's max_output_tokens
      },
    });
    // If the cap was hit the JSON is cut off mid-object — say so instead of a cryptic parse error.
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new Error(`Gemini stopped at the ${MAX_OUTPUT_TOKENS}-token output limit before finishing the JSON. Raise MAX_OUTPUT_TOKENS in providers/util.ts or narrow the extraction focus.`);
    }
    return JSON.parse(cleanJson(response.text || '{}'));
  },
};
