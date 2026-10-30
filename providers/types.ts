// Provider abstraction: each AI backend implements `run` (transport + structured
// output parsing). The template engine builds the prompt + schema; providers only
// carry the request and return the parsed flat JSON object.

export type ProviderId = 'gemini' | 'openai' | 'anthropic';

export interface ProviderRunArgs {
  prompt: string;
  schema: any;          // Gemini-flavored schema OR standard JSON Schema (see schemaFlavor)
  pdfBase64?: string;   // raw base64 (no data: prefix); omitted for text-only calls (screening)
  mimeType?: string;
  model: string;        // provider-specific model id
  apiKey: string;
}

export interface ExtractionProvider {
  /** Which schema dialect this provider consumes. */
  schemaFlavor: 'gemini' | 'jsonschema';
  run(args: ProviderRunArgs): Promise<any>;
}
