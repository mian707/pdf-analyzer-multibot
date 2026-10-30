# Development

## Layout

| Path | Role |
| --- | --- |
| `App.tsx` | Projects, parsers, screening queues, batch execution, CSV orchestration and persistence |
| `components/` | Screening cards, extraction cards and PDF viewer |
| `templates/` | Zebrafish, rat and soil-microplastics extraction definitions and registry |
| `templateTypes.ts` | Fields, sections, repeating groups and generic extraction record |
| `lib/buildFromTemplate.ts` | Schemas, prompts, extraction CSV export/import and legacy migration |
| `lib/screeningRules.ts` | Human-status gates and conflict predicates |
| `lib/pdfMatch.ts` | Identifier/filename/title matching for full-text PDFs |
| `lib/db.ts` | IndexedDB project-state and PDF-blob storage |
| `providers/` | Model registry, provider adapters, key selection and shared retry/output-limit helper |
| `services/geminiService.ts` | Provider-independent task orchestration and retrieval helpers |
| `scripts/export-protocol.mjs` | Offline generation of current extraction prompts/schemas |

The generic record is `{ templateId, values, groups, evidence }`. Evidence snippets are stored by field ID. This does not provide a separately adjudicated reference or an observation-level validation engine.

## Add a discipline

Create a `DisciplineTemplate` in `templates/` and register it in `templates/index.ts`. Define study fields in sections and, where needed, a repeating group with explicit instructions for when a new row should be produced. Use stable field IDs and unique human-readable CSV labels. CSV export supports **at most one repeating group**; do not assume every possible template shape is supported.

Run the type check, build and protocol export. Inspect both Gemini-style and JSON Schema outputs, use synthetic data to check CSV export/import, and review the UI before using real materials. A new template requires domain validation; registering it does not establish extraction performance.

## Add or change a model/provider

Change model strings in `providers/models.ts`. For a new provider, implement `ExtractionProvider`, register it, add its key binding and review its input, schema, completion and retry behaviour. Keep model/provider comparisons explicit; do not claim equivalence from a shared interface.

Avoid rewriting historical model strings or prompts to make a study appear reproducible. Tag later changes separately and keep the actual executed version identifiable.

## Checks

```sh
npm ci
npm run lint
npm run build
npm run protocol
git diff --exit-code -- docs/protocol
```

GitHub Actions performs these checks without model credentials. For a manual smoke check, import the synthetic screening CSV into a new project, include/mark unsure one record, verify the full-text queue, export/re-import into a second project and reload to check local persistence. A live API test is separate, may cost money and must not use credentials in CI or committed files.
