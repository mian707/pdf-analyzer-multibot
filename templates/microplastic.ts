// templates/microplastic.ts
// Models Microplastic-Template.xlsx exactly. ONE study reports MANY rows (one
// per soil/field type), so Soil type + Mean/Min/Max/Unit are a REPEATING GROUP.

import type { DisciplineTemplate } from '../templateTypes';

export const microplasticTemplate: DisciplineTemplate = {
  id: 'microplastic',
  name: 'Microplastics in soil',
  description:
    'Extract reported microplastic abundance in soil/farmland, the polymer types found, and the analytical methods used to recover and identify the particles.',
  repeatStudyColsOnEveryRow: false, // mirror the sheet: study cols blank on continuation rows
  focusHint: 'e.g. a particular crop, region, or polymer',

  sections: [
    {
      id: 'study',
      title: 'Study',
      fields: [
        { id: 'reference', label: 'Reference', type: 'string', evidence: true, emphasis: 'badge',
          description: 'Short citation (first author et al., year).', example: 'Liu et al., 2018' },
        { id: 'studyTitle', label: 'Study Title', type: 'string', emphasis: 'summary',
          description: 'Full title of the paper.' },
        { id: 'location', label: 'Location', type: 'string', evidence: true,
          description: 'Geographic location / land use of the sampled site(s).',
          example: 'Vegetable farmlands, China' },
      ],
    },
    {
      id: 'methods',
      title: 'Methods',
      fields: [
        { id: 'polymerTypes', label: 'Polymers Types', type: 'string[]', evidence: true,
          description: 'All polymer types identified, with abbreviations as reported.',
          example: 'Polypropylene (PP); polyethylene (PE); polyester (PES)' },
        { id: 'identificationMethod', label: 'Identification Method', type: 'string', evidence: true,
          description: 'Technique used to identify/confirm polymers.',
          example: 'µ-FT-IR; stereomicroscope + FTIR' },
        { id: 'digestionMethod', label: 'Digestion Method', type: 'string',
          description: 'Chemical digestion used to remove organic matter, or "NA".', example: '30% H2O2' },
        { id: 'densitySeparation', label: 'Density Separation', type: 'string',
          description: 'Density separation solution and density, or "NA".',
          example: 'saturated NaCl (1.19 g/cm³)' },
      ],
    },
  ],

  repeatingGroups: [
    {
      id: 'measurements',
      title: 'Per-site measurements',
      itemLabelField: 'fieldType',
      description:
        'Return ONE object for EACH distinct soil/field type or sampling stratum the study reports a microplastic concentration for (e.g. shallow soil vs deep soil, or orchards vs paddy fields vs vegetable plots). If the study reports only one overall value, return a single object.',
      fields: [
        { id: 'fieldType', label: 'Soil / Field Type', type: 'string',
          description: 'The soil layer, land use, or stratum this row describes.',
          example: 'Shallow soil; Deep soil; orchards; paddy fields' },
        { id: 'mean', label: 'Mean', type: 'string',
          description: 'Mean abundance for this stratum, with ± SD if reported. "NA" if not given.',
          example: '78.00 ± 12.91' },
        { id: 'min', label: 'Min', type: 'string', description: 'Minimum abundance reported, or "NA".' },
        { id: 'max', label: 'Max', type: 'string', description: 'Maximum abundance reported, or "NA".' },
        { id: 'unit', label: 'Unit', type: 'string', description: 'Unit of the abundance values.',
          example: 'items kg⁻¹' },
      ],
    },
  ],

  defaultCriteria:
    'INCLUDE primary field studies that quantify microplastic abundance in agricultural or farmland soil. EXCLUDE reviews, lab spiking experiments, water/sediment-only studies, and studies without a measured soil concentration.',
};
