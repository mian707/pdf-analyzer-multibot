# Synthetic examples

`screening-demo.csv` contains two invented citations, no real authors, DOI or PMID. It is an app-format screening import, not a research dataset or a set of model-generated results.

Create a new zebrafish project, choose Import results and select the CSV. Mark one record INCLUDED and the other NOT_SURE; both should appear in the full-text queue. Export screening results, create a second project and import the export. Check the IDs and human decisions and reload the page to check persistence. No API key is needed for this manual exercise.

These records have no source PDFs. Attach only a synthetic or appropriately licensed document if exploring PDF handling. Uploading a PDF on the extraction screen can immediately initiate a paid model request when a valid key is configured.

`run-record.template.json` is a blank planning aid for a new research run. Its null values are unrecorded information, not observed settings or results. Copy and complete it separately; do not commit private inputs, responses or credentials.
