// templates/rat.ts
// Same endocrine endpoints as the zebrafish toxicity template, but structured like
// the microplastic template: instead of fixed Male/Female column pairs, endpoints
// live in a REPEATING GROUP — one row per measured endpoint (per sex / dose group).
// This collapses ~80 flat fields into a tidy long format and naturally skips
// endpoints a given study never measured.

import type { DisciplineTemplate } from '../templateTypes';

export const ratTemplate: DisciplineTemplate = {
  id: 'rat',
  name: 'Endocrine toxicity in rats',
  description:
    'Extract chemical exposure design and endocrine endpoints (VTG, estrogen-signalling genes, hormone levels, neuroendocrine genes) from in vivo rat toxicity studies, reporting one row per measured endpoint.',
  repeatStudyColsOnEveryRow: false, // blank the study columns on continuation rows
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
        { id: 'systems', label: 'System', type: 'string[]', description: "Biological systems/species, e.g. 'rat', 'Sprague-Dawley rat'." },
        { id: 'ratStrain', label: 'Rat Strain', type: 'string', evidence: true, emphasis: 'badge',
          description: "Rat strain used, e.g. 'Sprague-Dawley', 'Wistar', 'Long-Evans', or 'Not Applicable'." },
        { id: 'chemicals', label: 'Chemicals', type: 'string[]', evidence: true, description: 'Substances evaluated.' },
        { id: 'doses', label: 'Doses', type: 'string[]', evidence: true,
          description: "Tested doses with units, e.g. '10 mg/kg/day', '100 mg/kg bw', '0 (control)'." },
        { id: 'exposureDuration', label: 'Duration', type: 'string', evidence: true,
          description: "Exposure duration / window, e.g. '28 days', 'GD6–PND21'." },
        { id: 'exposureType', label: 'Exposure', type: 'string',
          description: "e.g. 'Acute', 'Subacute', 'Subchronic', 'Chronic', 'Developmental'." },
        { id: 'routeOfAdministration', label: 'Route', type: 'string', required: false,
          description: "Route of administration, e.g. 'Oral gavage', 'Diet', 'Drinking water', 'Subcutaneous injection'." },
        { id: 'hasTranscriptomics', label: 'Transcriptomics', type: 'boolean', emphasis: 'badge',
          description: 'True if the study uses transcriptomics (RNA-Seq, microarrays, qPCR profiling).' },
      ],
    },
    {
      id: 'toxicityValues',
      title: 'Toxicity Endpoints',
      fields: [
        { id: 'noaelValues', label: 'NOAEL Values', type: 'string[]', required: false, evidence: true,
          description: "NOAEL values with units and the endpoint they refer to, or empty if not reported." },
        { id: 'loaelValues', label: 'LOAEL Values', type: 'string[]', required: false, evidence: true,
          description: "LOAEL values with units and the endpoint they refer to, or empty if not reported." },
        { id: 'ld50Values', label: 'LD50 Values', type: 'string[]', required: false, evidence: true,
          description: "LD50 values per chemical with units, or empty if not reported." },
      ],
    },
    {
      id: 'conclusions',
      title: 'Endpoint Conclusions',
      fields: [
        { id: 'estrogenConclusion', label: 'Estrogen Signaling Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence statement on estrogen-signalling markers (ERα/esr1, ERβ/esr2, aromatase Cyp19a1). 'Not assessed' if none measured." },
        { id: 'hormoneConclusion', label: 'Hormone Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence conclusion on circulating hormone changes (E2, T, etc.). 'Not assessed' if none measured." },
        { id: 'neuroendocrineConclusion', label: 'Neuroendocrine Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence statement on neuroendocrine markers (Kiss1, Kiss1r, GnRH). 'Not assessed' if none measured." },
        { id: 'vtgConclusion', label: 'VTG Summary', type: 'string', required: false, evidence: true,
          description: "One-sentence statement on vitellogenin if measured (uncommon in mammals). 'Not assessed' if not measured." },
      ],
    },
  ],

  repeatingGroups: [
    {
      id: 'endpoints',
      title: 'Endocrine endpoints',
      itemLabelField: 'endpoint',
      description:
        'Return ONE object for EACH endocrine endpoint the study actually measured — separately per sex and per dose group when the study reports them separately. ' +
        'Cover these endpoint families WHERE MEASURED: ' +
        '(1) VTG — vitellogenin protein or vtg mRNA; ' +
        '(2) Estrogen-signalling genes — ERα (esr1), ERβ (esr2), aromatase Cyp19a1 (or the fish paralogs cyp19a / cyp19b if reported); ' +
        '(3) Hormone levels — Estradiol (E2), Testosterone (T), 11-Ketotestosterone, Progesterone, FSH, LH, T3, T4, Cortisol/Corticosterone, and the E2/T ratio; ' +
        '(4) Neuroendocrine genes — Kiss1, Kiss1r, GnRH (gnrh3). ' +
        'Do NOT create rows for endpoints that were not measured in this study.',
      fields: [
        { id: 'endpoint', label: 'Endpoint', type: 'string',
          description: "The specific marker, e.g. 'Estradiol (E2)', 'Testosterone', 'ERα (esr1) mRNA', 'Aromatase (Cyp19a1)', 'Kiss1', 'VTG protein'." },
        { id: 'category', label: 'Category', type: 'string',
          description: "One of: 'VTG', 'Estrogen signaling', 'Hormone level', 'Neuroendocrine'." },
        { id: 'sex', label: 'Sex', type: 'string', description: "'Male', 'Female', 'Both', or 'Pooled'." },
        { id: 'doseGroup', label: 'Dose Group', type: 'string', required: false,
          description: "Dose/treatment group this result refers to, e.g. '100 mg/kg/day', or 'Overall' if not dose-resolved." },
        { id: 'matrix', label: 'Matrix', type: 'string', required: false,
          description: "Sample matrix, e.g. 'Plasma', 'Serum', 'Tissue homogenate', or 'NA'." },
        { id: 'tissue', label: 'Tissue', type: 'string', required: false,
          description: "Tissue/organ analysed, e.g. 'Testis', 'Ovary', 'Brain', 'Liver', or 'NA'." },
        { id: 'direction', label: 'Direction', type: 'string',
          description: "Direction of change vs control: 'Increase', 'No change', 'Decrease', or 'N/A'. Do NOT include time or duration." },
        { id: 'significance', label: 'Significance', type: 'string',
          description: "Statistical significance: 'Significant', 'Not Significant', or 'N/A'." },
      ],
    },
  ],

  defaultCriteria:
    'Include primary in vivo rat studies evaluating endocrine endpoints after chemical exposure. Exclude reviews, editorials, in vitro-only studies, and non-rat species.',
};
