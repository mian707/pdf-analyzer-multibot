# Release verification

The following checks were completed locally for version 0.1.0 on 30 October 2026, using Node.js 24.22.1 on Windows:

| Check | Result |
| --- | --- |
| Install committed dependency lockfile with `npm ci --ignore-scripts` | Passed |
| `npm run lint` (`tsc --noEmit`) | Passed |
| `npm run build` | Passed; Vite reported a bundle-size advisory, not a build failure |
| `npm run protocol` | Exported prompts and both schema formats for all three templates without provider calls |
| Generated JSON schemas and local documentation links | Parsed / resolved |
| Original source comparison | Templates, adapters, task orchestration and application workflow match the supplied ZIP |
| Publication-content scan | No matching credential patterns, real environment files or private document/data attachments found in the publication files |
| Local browser smoke check | Created a project, imported two synthetic CSV records, recorded human INCLUDED/NOT_SURE decisions and confirmed that both entered the full-text queue |
| Persistence smoke check | Reloaded the page, reopened the project and confirmed the two records and full-text queue persisted |

These checks establish packaging and the exercised manual workflow, not scientific extraction performance. The credential-pattern scan is a limited publication check, not a comprehensive security audit. No live paid provider calls, model-availability checks, OCR evaluation, automatic PDF-retrieval test or independent extraction-accuracy validation was performed for this release.

GitHub Actions repeats the installation, TypeScript check, production build and protocol snapshot comparison. Remote check results are visible in the repository's Actions tab; they are separate from the local results recorded above.
