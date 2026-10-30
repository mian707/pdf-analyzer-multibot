// templates/toxicity.ts
// Endocrine toxicity in ZEBRAFISH, expressed in the same long format as the rat
// template: instead of fixed Male/Female column pairs, each measured endpoint is
// ONE ROW in a repeating group (per sex / treatment group). Endpoints a study did
// not measure simply produce no rows.
//
// NOTE: this replaces the original wide (~88-column) zebrafish layout. Existing
// saved zebrafish data is not deleted — re-running extraction (the Re-extract
// button) repopulates a record in this new structure.

import type { DisciplineTemplate } from '../templateTypes';

export const toxicityTemplate: DisciplineTemplate = {
  id: 'toxicity',
  name: 'Endocrine toxicity in zebrafish',
  description:
    'Extract chemical exposure design and endocrine endpoints (VTG, estrogen-signalling genes, hormone levels, neuroendocrine genes) from zebrafish toxicity studies, reporting one row per measured endpoint.',
  repeatStudyColsOnEveryRow: false, // blank study columns on continuation rows
  focusHint: 'e.g. specific chemicals like BPA, BPS',

  sections: [
    {
      id: 'overview',
      title: 'Overview',
      fields: [
        { id: 'title', label: 'Title', type: 'string', emphasis: 'summary', description: 'Full title of the paper.' },
        { id: 'studySummary', label: 'Study Summary', type: 'string', evidence: true, emphasis: 'summary',
          description: 'A concise two-sentence summary of the key findings.' },
        { id: 'articleType', label: 'Article Type', type: 'string', emphasis: 'badge',
          description: "e.g. 'Research Article', 'Review Article', 'Case Report'." },
        { id: 'studyTypes', label: 'Study Types', type: 'string[]', description: "e.g. 'in vivo', 'in vitro', 'in silico'." },
        { id: 'systems', label: 'System', type: 'string[]', description: "Biological systems, e.g. 'zebrafish', 'zebrafish embryo'." },
        { id: 'zebrafishStrain', label: 'Zebrafish Strain', type: 'string', evidence: true, emphasis: 'badge',
          description: "Specific zebrafish strain used, e.g. 'AB', 'TU', 'Wild-type', or 'Not Applicable'." },
        { id: 'chemicals', label: 'Chemicals', type: 'string[]', evidence: true, description: 'Substances evaluated.' },
        { id: 'testedConcentrations', label: 'Tested Concentrations', type: 'string[]', evidence: true,
          description: "Tested concentrations with units, e.g. '10 µg/L', '100 nM', '0 (control)'." },
        { id: 'exposureDuration', label: 'Duration', type: 'string', evidence: true,
          description: "Exposure duration, e.g. '96 hpf', '21 days'." },
        { id: 'exposureType', label: 'Exposure', type: 'string',
          description: "Exposure classification, e.g. 'Acute', 'Chronic', 'Developmental'." },
        { id: 'renewal', label: 'Renewal', type: 'string', required: false,
          description: "Solution renewal regime (e.g. 'static', 'semi-static daily', 'flow-through') or 'no information'." },
        { id: 'hasTranscriptomics', label: 'Transcriptomics', type: 'boolean', emphasis: 'badge',
          description: 'True if the study uses transcriptomics (RNA-Seq, microarrays, qPCR profiling).' },
      ],
    },
    {
      id: 'toxicityValues',
      title: 'Toxicity Endpoints',
      fields: [
        { id: 'lc50Values', label: 'LC50 Values', type: 'string[]', required: false, evidence: true,
          description: "LC50 values per chemical with units, or empty if not reported." },
        { id: 'ec50Values', label: 'EC50 Values', type: 'string[]', required: false, evidence: true,
          description: "EC50 values per chemical with units, or empty if not reported." },
      ],
    },
    {
      id: 'conclusions',
      title: 'Endpoint Conclusions',
      fields: [
        { id: 'vtgConclusion', label: 'VTG Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence conclusion on vitellogenin (VTG) induction. 'Not assessed' if not measured." },
        { id: 'estrogenConclusion', label: 'Estrogen Signaling Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence statement on estrogen-signalling markers (erα, erβ, cyp19a, cyp19b). 'Not assessed' if none measured." },
        { id: 'hormoneConclusion', label: 'Hormone Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence conclusion on circulating hormone changes (E2, T, etc.). 'Not assessed' if none measured." },
        { id: 'neuroendocrineConclusion', label: 'Neuroendocrine Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence statement on neuroendocrine markers (kiss1, kiss1r, gnrh3). 'Not assessed' if none measured." },
      ],
    },
  ],

  repeatingGroups: [
    {
      id: 'endpoints',
      title: 'Endocrine endpoints',
      itemLabelField: 'endpoint',
      description:
        'Return ONE object for EACH endocrine endpoint the study actually measured — separately per sex and per treatment/concentration group when the study reports them separately. ' +
        'Cover these endpoint families WHERE MEASURED: ' +
        '(1) VTG — vitellogenin (vtg1) mRNA or VTG protein; ' +
        '(2) Estrogen-signalling genes — esr1 (erα), esr2 (erβ), cyp19a1a (cyp19a, ovarian aromatase), cyp19a1b (cyp19b, brain aromatase); ' +
        '(3) Hormone levels — Estradiol (E2), Testosterone (T), 11-Ketotestosterone, Progestin/17,20β-DHP, FSH, LH, T3, T4, Cortisol, and the E2/T ratio; ' +
        '(4) Neuroendocrine genes — kiss1, kiss1r, gnrh3. ' +
        'Do NOT create rows for endpoints that were not measured in this study.',
      fields: [
        { id: 'endpoint', label: 'Endpoint', type: 'string',
          description: "The specific marker, e.g. 'VTG protein', 'vtg1 mRNA', 'esr1 (erα)', 'cyp19a1b (brain aromatase)', 'Estradiol (E2)', 'kiss1'." },
        { id: 'category', label: 'Category', type: 'string',
          description: "One of: 'VTG', 'Estrogen signaling', 'Hormone level', 'Neuroendocrine'." },
        { id: 'sex', label: 'Sex', type: 'string', description: "'Male', 'Female', 'Both', 'Pooled', or 'Larvae'." },
        { id: 'treatmentGroup', label: 'Treatment Group', type: 'string', required: false,
          description: "Concentration/treatment group this result refers to, e.g. '10 µg/L', or 'Overall' if not group-resolved." },
        { id: 'matrix', label: 'Matrix', type: 'string', required: false,
          description: "Sample matrix, e.g. 'Whole body homogenate', 'Plasma', 'Tissue', or 'NA'." },
        { id: 'tissue', label: 'Tissue', type: 'string', required: false,
          description: "Tissue/organ analysed, e.g. 'Gonad', 'Brain', 'Liver', 'Whole body', or 'NA'." },
        { id: 'direction', label: 'Direction', type: 'string',
          description: "Direction of change vs control: 'Increase', 'No change', 'Decrease', or 'N/A'. Do NOT include time or duration." },
        { id: 'significance', label: 'Significance', type: 'string',
          description: "Statistical significance: 'Significant', 'Not Significant', or 'N/A'." },
      ],
    },
  ],

  defaultCriteria:
    'Include primary research studies evaluating endocrine toxicity in zebrafish. Exclude reviews, editorials, and case reports.',
};
