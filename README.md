# BioReview Pro

BioReview Pro (PDF Analyzer Multibot) is a browser application for literature screening and structured extraction from scientific PDFs. It combines human decisions with model suggestions and exports the results as CSV files. The code uses React, TypeScript and Vite.

The three stages are title/abstract screening, full-text eligibility screening and extraction. Three extraction templates are included: endocrine toxicity in zebrafish, endocrine toxicity in rats, and microplastics in soil. Google Gemini, OpenAI and Anthropic adapters share the application workflow, but use different provider APIs and document formats.

**Version 0.1.0** is the first public source release. It packages the author-supplied `pdf-analyzer_multibot.zip`; it is not a claim that every historical study request can be reconstructed from this archive. See [Research reproducibility](docs/REPRODUCIBILITY.md).

## Install and run

Use Node.js **22.12 or later** and npm. A current Chrome or Edge browser is recommended for local PDF handling. Internet access is needed for dependency installation, external styles/fonts, PDF retrieval and model calls.

```sh
git clone https://github.com/mian707/pdf-analyzer-multibot.git
cd pdf-analyzer-multibot
npm ci
```

Copy `.env.local.example` to `.env.local`:

```powershell
# Windows PowerShell
Copy-Item .env.local.example .env.local
```

```sh
# macOS or Linux
cp .env.local.example .env.local
```

Edit `.env.local` and supply the key for the provider you intend to use. Leave other entries blank. Then run:

```sh
npm run dev
```

Open the local address printed by Vite, normally `http://127.0.0.1:3000`. Restart Vite after changing keys. The app can be opened without keys to explore projects, manual screening and CSV import; model calls need a valid key, account access and may incur charges.

**Run this release locally.** API keys are inserted into the browser JavaScript at startup/build time. Publishing a built site would expose any embedded keys to its visitors. This repository contains no backend, user authentication or public-hosting configuration. See [Security and data handling](SECURITY.md).

## Quick start

1. Create a project, choose a discipline and select a model. Review the criteria rather than relying on the template defaults.
2. Import MEDLINE/PubMed text (`.nbib` or `.txt`), RIS, or a screening CSV exported by this app. The [synthetic examples](examples/README.md) can be used without research data.
3. Record your title/abstract decisions and, if desired, request AI suggestions. Human `INCLUDED` and `NOT_SURE` records enter the full-text queue; an AI suggestion alone does not advance a record.
4. Attach the correct full-text PDFs, enter full-text criteria and record eligibility decisions. Full-text AI suggestions are stored separately. Included records can be advanced to extraction; the extraction screen also accepts direct PDF uploads.
5. Review extracted values, source snippets and missing observations against each paper. Export the results from each stage. Keep the PDFs separately; CSV exports are not complete project backups.

Detailed steps, data formats and limitations are in the [User guide](docs/USER_GUIDE.md).

## Configuration and verification

```sh
npm run lint       # TypeScript check; this is not an ESLint command
npm run build      # Compile the application
npm run preview    # Preview the compiled application locally
npm run protocol   # Regenerate current extraction prompt/schema snapshots
```

The source registry in [`providers/models.ts`](providers/models.ts) records these strings:

| Provider | Configured model strings |
| --- | --- |
| Google | `gemini-3-flash-preview` |
| OpenAI | `gpt-5.6` |
| Anthropic | `claude-sonnet-5`, `claude-opus-4-8` |

These are identifiers in the supplied code, not a verified list of currently available models. Availability depends on the provider and your account. This release was checked without paid inference calls. See [Configuration](docs/CONFIGURATION.md) for request formats, output limits, retries and retrieval dependencies.

## Documentation

- [User guide and troubleshooting](docs/USER_GUIDE.md)
- [Configuration and provider requests](docs/CONFIGURATION.md)
- [Reproducibility and software citation](docs/REPRODUCIBILITY.md)
- [Architecture and adding templates](docs/DEVELOPMENT.md)
- [Release verification](docs/VALIDATION.md)
- [Release notes](docs/RELEASE_NOTES.md) and [changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md) and [MIT licence](LICENSE)

## Cite this software

Aslam, A. (2026). *BioReview Pro: PDF Analyzer Multibot* (Version 0.1.0) [Computer software]. GitHub. https://github.com/mian707/pdf-analyzer-multibot/releases/tag/v0.1.0

Use the release link and record the commit used in your work. Machine-readable metadata is in [`CITATION.cff`](CITATION.cff). No software DOI has been assigned by this repository. The source release does not include the manuscript, study PDFs, human reference dataset, evaluation results or original API run logs.
