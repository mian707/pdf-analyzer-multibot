# Research reproducibility and citation

## What this release records

Version 0.1.0 packages the author-supplied `pdf-analyzer_multibot.zip` as confirmed for publication on 30 October 2026. The archive SHA-256 is `d6e03261dc8cb04577b7d315a7df5f38bcc8283b153e53cc74abc1834e89fcb4`. Archive filesystem dates are not used to infer study execution dates.

The application logic, model registry, templates, prompts and provider adapters are retained from that archive. Publication changes are documented in the [changelog](../CHANGELOG.md). This repository is the application source release, not a complete replication package for the accompanying study. It contains no source-article PDFs, study screening/extraction datasets, human adjudication records, performance-analysis scripts or historical API logs.

Use `npm ci` with the committed lockfile. Save `node --version`, `npm --version`, operating system, browser version, exact Git commit and release tag. A numbered GitHub release identifies a source snapshot; a repository's default branch can change. If the exact application executed in a study differs from this release, identify and archive that executed version separately. Do not label this snapshot as the exact historical implementation without checking.

## Prompts and schemas

`npm run protocol` regenerates prompt and schema snapshots in [`protocol/`](protocol/) for all three templates without making model calls. These represent the current template extraction task with no focus terms or existing extraction. Runtime focus/enrichment changes the prompt. Screening prompt strings and schemas are in `services/geminiService.ts`; record the actual criteria and study title/abstract/PDF sent in each run.

The publication source does not explicitly set HIGH reasoning or top-p = 0.98. If such settings were used in historical runs, preserve the actual executed code and provider-specific request values with those runs. Their absence here must not be filled by invented metadata.

## Record each new run

Copy [`examples/run-record.template.json`](../examples/run-record.template.json) outside the repository and fill it for each model, stage and repeat. At minimum record:

1. Release tag and commit, execution date/time (with timezone), dependency/runtime versions and selected template.
2. Provider, exact API model string, task criteria, focus terms, fully rendered prompt and submitted schema. Record explicit sampling/reasoning settings or that a setting was omitted, rather than assuming a provider default value.
3. Input identifiers and file checksums, which PDFs/supplements were submitted, and any preprocessing. Keep copyrighted articles in an appropriate separate location.
4. Raw response, completion/finish reason, request ID, reported token usage and retry/error records where available. These API run logs are **not** the API key; never include keys or authorization headers.
5. Original unedited outputs, human decisions/corrections, missing observations added during verification, and the rules used for matching/scoring against the human reference.

The current UI does not automatically collect all these details; collect them separately or add logging in a clearly identified later version. Export results before changing models, re-extracting or enriching. Treat those operations as new runs. Separate human adjudication from the raw output.

## Interpreting comparisons

Matching prompts and nominal token caps do not make native PDF processing equivalent across providers. Provider versions, document interpretation, hidden reasoning budgets and stochastic output can differ. Structured JSON constrains form, not truth or completeness. This release adds no new scientific validation results, and a successful build does not validate extraction accuracy.

## Software citation

Aslam, A. (2026). *BioReview Pro: PDF Analyzer Multibot* (Version 0.1.0) [Computer software]. GitHub. https://github.com/mian707/pdf-analyzer-multibot/releases/tag/v0.1.0

[`CITATION.cff`](../CITATION.cff) provides the software citation. For a manuscript, cite the versioned release and the commit actually used. Do not assign the application a fabricated DOI or a manuscript publication date. A DOI can be added later if a release is archived through a service such as Zenodo; it has not been created here. This release's software authorship lists Arslan Aslam; maintainers can extend it when additional software contributors are confirmed.
