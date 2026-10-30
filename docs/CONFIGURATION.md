# Configuration

## Keys and local execution

`.env.local.example` lists `GEMINI_API_KEY`, `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. Keep real values in the ignored `.env.local` file. `vite.config.ts` replaces references to these variables in browser JavaScript. Gemini retains a legacy `process.env.API_KEY` binding mapped to `GEMINI_API_KEY`. Restart the development server, or rebuild, after changing values.

The publication package binds the development server to `127.0.0.1` rather than all network interfaces. The application still runs in the browser, with no backend to conceal keys. Do not deploy a build containing real keys to GitHub Pages or another shared host.

## Model selection and request construction

`providers/models.ts` supplies project model IDs, labels and API model strings. `providers/index.ts` selects an adapter and key. The registry is a source snapshot: current provider availability was not tested with live inference. Edit a model string only deliberately and record the changed commit and execution date.

| Adapter | API | PDF input | Structured output |
| --- | --- | --- | --- |
| Gemini | `GoogleGenAI.models.generateContent` | Base64 `inlineData` plus prompt text | `application/json` with `responseSchema` |
| OpenAI | `POST https://api.openai.com/v1/responses` | Base64 data URL in `input_file`, plus `input_text` | `text.format` JSON Schema, strict mode |
| Anthropic | `POST https://api.anthropic.com/v1/messages` | Base64 document block plus prompt text | Forced `record_extraction` tool with an input schema |

All three adapters use the same orchestration service despite its legacy filename, `services/geminiService.ts`. Title/abstract screening sends title, abstract and criteria, without a PDF. Full-text screening sends the attached PDF, title and full-text criteria. Extraction sends the PDF and the template-generated prompt, optionally with focus terms or existing values for enrichment. Embedded figures remain in the submitted PDF. There is no separate automatic attachment of supplementary documents, figure rasterisation or local OCR step.

The shared constant `MAX_OUTPUT_TOKENS` is **16,000**, mapped to `maxOutputTokens`, `max_output_tokens` or `max_tokens`. Equal numeric limits do not establish equivalent reasoning budgets, provider processing or document handling. This source does **not** explicitly set temperature, top-p or a reasoning/thinking level. Do not infer those values from a model name or a manuscript account of a different executed version.

Gemini checks the first candidate's `finishReason` for `MAX_TOKENS` and raises an error. OpenAI parses returned text but has no explicit `status`/incomplete-details check. Anthropic reads the first tool output but does not check `stop_reason` for token exhaustion. These checks do not establish equivalent protection against incomplete extraction.

## Retries and batching

`withRetry` in `providers/util.ts` makes up to **five total attempts** per wrapped call: one initial attempt and four possible retries. Retryable conditions include status/message checks for 429, 503, 529, overload, rate limit and deadline exceeded. For retry index `i = 0..3`, the wait is `3,000 × 2^i` milliseconds plus uniform random jitter from 0 to 2,000 milliseconds.

UI batch loops add their own delays. Title/abstract screening adapts delays after success/overload; extraction/enrichment also sequence calls. The wrapper's five-attempt bound is not a limit on all requests a UI batch could eventually initiate. There is no persistent raw-response, token-usage, request-ID or retry-count audit log. A project stores its selected model, rather than a complete immutable model/configuration record for every response.

## PDF retrieval and external services

Manual PDF attachment works without retrieval credentials. Optional automatic retrieval uses:

- Unpaywall's API, with the source's hard-coded `support@bioreviewpro.com` email parameter. That address is not established as an active project support contact. Before depending on Unpaywall, configure an appropriate contact address according to its service requirements.
- `corsproxy.io` for remote PDF download. This third party sees the requested URL and downloaded content.
- A same-origin `/api/elsevier-proxy` endpoint using optional Elsevier credentials. **No implementation or Vite proxy for that endpoint is supplied**, so the standalone app does not provide working Elsevier retrieval out of the box.
- Tailwind's CDN and Google Fonts in `index.html` for presentation. Local running does not mean fully offline operation.

No retrieval proxy or service is silently installed by this release. See [Security](../SECURITY.md) for storage and data transfers.
