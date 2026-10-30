# Changelog

## 0.1.0 — 2026-10-30

First public source release of the author-supplied PDF Analyzer Multibot application, displayed as BioReview Pro in the interface.

- Documented installation, human/AI screening roles, PDF handling, extraction, CSV formats and local persistence.
- Added an MIT licence, software citation metadata, synthetic examples, reproducibility guidance and release notes.
- Added generated current extraction prompt/schema snapshots and a command to regenerate them without inference calls.
- Added build/type-check automation and explicit exclusions for secrets and local research materials.
- Set package release metadata and bound the development server to the local loopback interface for local use.

The source archive's model registry, provider request construction, retry logic, task prompts, templates and screening/extraction logic are retained. Source provenance and any additional build repairs are recorded in `docs/RELEASE_NOTES.md`. No new model-performance evaluation or historical API-log reconstruction is included.
