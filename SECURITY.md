# Security and data handling

## Intended use

This release is a local, single-user research tool. It is not a multi-user hosted service. Provider keys from `.env.local` are embedded into the browser bundle by Vite; hiding that file from Git does not make a built application safe to publish with real keys. Keep the server on the default loopback interface. A shared deployment requires a separately designed authenticated backend and server-side secret management, which this repository does not supply.

The `.gitignore` excludes real environment files, build outputs, credentials, local research data and PDFs. `.env.local.example` contains blank variables only. `node scripts/check-publication.mjs` checks tracked files for common credential patterns, nonblank example keys and excluded document types; GitHub Actions repeats this check. It is a pattern check rather than proof that every possible secret format is recognised. Do not commit keys, raw request headers, browser profiles, source PDFs, confidential documents or study exports. Rotate any key that was accidentally disclosed through its provider; deleting a current file does not remove it from Git history.

## Where data goes

- PDFs and project state persist in IndexedDB; project metadata and optional Elsevier credentials persist in localStorage. This browser storage is not an encrypted secrets vault and can be read by scripts running on that origin.
- AI actions send title/abstract/criteria or PDF content, prompts and any supplied partial extraction to the selected provider. Provider terms and retention settings apply. Local project storage does not mean that model processing remains on the device.
- Automatic retrieval can contact Unpaywall, a public CORS proxy and an optional same-origin Elsevier proxy. The repository does not implement the Elsevier endpoint. The public proxy sees requested URLs and responses.
- The page loads Tailwind and Google Fonts from external services. These requests also mean that the UI is not fully offline.

Use materials you are permitted to process with the chosen services. Use manual PDF attachment to avoid retrieval-proxy dependencies where appropriate. Keep backups outside browser storage.

## Reporting a problem

Do not post credentials, unpublished PDFs, personal data or sensitive logs in a public issue. For a general defect, open an issue with synthetic/redacted reproduction steps. For a sensitive vulnerability, use the maintainer's GitHub profile to arrange private contact before sharing details. This project does not promise a response deadline or a private-reporting service that has not been configured.
