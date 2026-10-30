import type { ExtractionProvider } from './types';
import { MAX_OUTPUT_TOKENS } from './util';

// Anthropic Messages API. PDFs go in as a base64 document block. Structured output
// via forced tool use (guaranteed JSON in tool_use.input) — robust across model
// versions. Browser calls require the direct-browser-access header.
export const anthropicProvider: ExtractionProvider = {
  schemaFlavor: 'jsonschema',
  async run({ prompt, schema, pdfBase64, mimeType, model, apiKey }) {
    if (!apiKey) throw new Error('Anthropic API key is not set (ANTHROPIC_API_KEY in .env.local).');
    const content: any[] = [];
    if (pdfBase64) {
      content.push({ type: 'document', source: { type: 'base64', media_type: mimeType || 'application/pdf', data: pdfBase64 } });
    }
    content.push({ type: 'text', text: prompt });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        tools: [{ name: 'record_extraction', description: 'Return the extracted structured data.', input_schema: schema }],
        tool_choice: { type: 'tool', name: 'record_extraction' },
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) {
      const err: any = new Error(`Anthropic ${res.status}: ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use');
    if (!toolUse?.input) throw new Error('Anthropic returned no structured tool output.');
    return toolUse.input;
  },
};
