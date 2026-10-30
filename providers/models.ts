import type { ProviderId } from './types';

export interface AiModel {
  id: string;          // stable id used in the UI + persisted per project
  label: string;
  providerId: ProviderId;
  model: string;       // provider-specific model string — update here if a name changes
}

// Model strings are the highest-churn detail in this file. If a provider renames a
// model, edit the `model` field here (one line) — nothing else needs to change.
export const AI_MODELS: AiModel[] = [
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash · Google',   providerId: 'gemini',    model: 'gemini-3-flash-preview' },
  { id: 'gpt-5.6',        label: 'GPT-5.6 · OpenAI',          providerId: 'openai',    model: 'gpt-5.6' },
  { id: 'claude-sonnet-5',label: 'Claude Sonnet 5 · Anthropic',providerId: 'anthropic', model: 'claude-sonnet-5' },
  { id: 'claude-opus-4-8',label: 'Claude Opus 4.8 · Anthropic',providerId: 'anthropic', model: 'claude-opus-4-8' },
];

export const DEFAULT_MODEL_ID = 'gemini-3-flash';

export const getModel = (id?: string | null): AiModel =>
  AI_MODELS.find((m) => m.id === id) || AI_MODELS.find((m) => m.id === DEFAULT_MODEL_ID) || AI_MODELS[0];
