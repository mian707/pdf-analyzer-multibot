import type { ProviderId, ExtractionProvider } from './types';
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';

export * from './models';
export type { ProviderId, ExtractionProvider } from './types';

const PROVIDERS: Record<ProviderId, ExtractionProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

export const getProvider = (id: ProviderId): ExtractionProvider => PROVIDERS[id];

// Keys are injected at build time by Vite `define` (see vite.config.ts). Gemini uses
// the pre-existing process.env.API_KEY binding for backward compatibility.
export const getApiKeyFor = (id: ProviderId): string => {
  if (id === 'openai') return (process.env.OPENAI_API_KEY as string) || '';
  if (id === 'anthropic') return (process.env.ANTHROPIC_API_KEY as string) || '';
  return (process.env.API_KEY as string) || '';
};

export const hasApiKeyFor = (id: ProviderId): boolean => !!getApiKeyFor(id);
