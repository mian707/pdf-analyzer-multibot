import type { ExtractionProvider } from './types';
import { cleanJson, MAX_OUTPUT_TOKENS } from './util';

// OpenAI Responses API. PDFs go in as input_file (base64 data URL); structured
// output via text.format.json_schema (strict). https://api.openai.com/v1/responses
export const openaiProvider: ExtractionProvider = {
  schemaFlavor: 'jsonschema',
  async run({ prompt, schema, pdfBase64, mimeType, model, apiKey }) {
    if (!apiKey) throw new Error('OpenAI API key is not set (OPENAI_API_KEY in .env.local).');
    const content: any[] = [];
    if (pdfBase64) {
      content.push({ type: 'input_file', filename: 'document.pdf', file_data: `data:${mimeType || 'application/pdf'};base64,${pdfBase64}` });
    }
    content.push({ type: 'input_text', text: prompt });

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [{ role: 'user', content }],
        max_output_tokens: MAX_OUTPUT_TOKENS,
        text: { format: { type: 'json_schema', name: 'extraction', strict: true, schema } },
      }),
    });
    if (!res.ok) {
      const err: any = new Error(`OpenAI ${res.status}: ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    let text: string | undefined = data.output_text;
    if (!text && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          const t = item.content.find((c: any) => c.type === 'output_text');
          if (t?.text) { text = t.text; break; }
          if (item.content.some((c: any) => c.type === 'refusal')) throw new Error('OpenAI refused the request.');
        }
      }
    }
    if (!text) throw new Error('OpenAI returned no output text.');
    return JSON.parse(cleanJson(text));
  },
};
