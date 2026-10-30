## BioReview Pro v0.1.0

First public source release of PDF Analyzer Multibot, a React/TypeScript application for human-reviewed literature screening and template-driven PDF extraction.

### Included

- Title/abstract screening, full-text eligibility suggestions and structured extraction.
- Zebrafish endocrine-toxicity, rat endocrine-toxicity and soil-microplastics templates.
- Google, OpenAI and Anthropic provider adapters; local browser persistence and CSV import/export.
- Installation/user/configuration guides, reproducibility notes, MIT licence, citation metadata and synthetic examples.
- Current extraction prompt/schema snapshots and automated build/type checks.

### Source provenance

Prepared from the author-confirmed `pdf-analyzer_multibot.zip` (SHA-256 `d6e03261dc8cb04577b7d315a7df5f38bcc8283b153e53cc74abc1834e89fcb4`). Publication packaging adds documentation, version metadata and local-only server binding. The adapters, model registry, scientific templates and screening/extraction logic retain the supplied implementation. This public version is not independently established as the exact code executed for every historical study run.

### Use and limitations

Run locally. API credentials are embedded into browser JavaScript; do not publish a credential-bearing build. Configured model identifiers require provider/account support and were not verified through paid calls. The Elsevier retrieval endpoint is not included. Human source checking is needed for correctness and completeness.

The release excludes manuscripts, study PDFs/datasets, human adjudication records and original API logs. It provides source availability rather than a complete study replication package. See the repository documentation for the explicit 16,000-token cap, retry behaviour and differences between provider adapters.

### Verification

Local TypeScript and production-build checks passed. Current prompt/schema snapshots were regenerated without inference calls. A browser smoke check confirmed synthetic CSV import, human screening gates and persistence after reload. No paid provider calls or new scientific performance evaluation was performed. Detailed scope is in `docs/VALIDATION.md`.

### Citation

Aslam, A. (2026). *BioReview Pro: PDF Analyzer Multibot* (Version 0.1.0) [Computer software]. GitHub. https://github.com/mian707/pdf-analyzer-multibot/releases/tag/v0.1.0
