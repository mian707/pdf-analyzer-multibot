// templates/index.ts
// The registry. To add a discipline: create templates/<name>.ts and register it here.

import type { DisciplineTemplate } from '../templateTypes';
import { toxicityTemplate } from './toxicity';
import { microplasticTemplate } from './microplastic';
import { ratTemplate } from './rat';

export const TEMPLATES: DisciplineTemplate[] = [toxicityTemplate, ratTemplate, microplasticTemplate];

export const DEFAULT_TEMPLATE_ID = toxicityTemplate.id;

const BY_ID: Record<string, DisciplineTemplate> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Look up a template by id, falling back to the default (keeps legacy projects working). */
export function getTemplate(id?: string | null): DisciplineTemplate {
  return (id && BY_ID[id]) || BY_ID[DEFAULT_TEMPLATE_ID];
}

export function listTemplates(): Array<{ id: string; name: string; description: string }> {
  return TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
}
