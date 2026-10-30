# Contributing

Open an issue describing a reproducible problem or propose a focused pull request. Include the release/commit, browser, Node/npm versions, expected behaviour and a minimal synthetic example. Do not attach API keys, copyrighted PDFs, confidential extracts or personal data.

Keep workflow, prompt/schema and provider changes identifiable. Explain whether a change alters the data sent to a provider, model configuration, screening gates, CSV layout or stored project structure. New scientific templates need documented domain-specific validation before performance claims are made.

Before a pull request, run `npm ci`, `npm run lint`, `npm run build` and `npm run protocol`. Review changes to generated snapshots and test the affected workflow with synthetic data. A live model call is not required for ordinary documentation or packaging contributions. Contributions are provided under the repository's MIT licence.
