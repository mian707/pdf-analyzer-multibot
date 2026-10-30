// =============================================================================
// lib/buildFromTemplate.ts
// -----------------------------------------------------------------------------
// Pure functions that turn a DisciplineTemplate into the artifacts that used to
// be hand-written and duplicated per discipline:
//   buildResponseSchema()   -> Gemini `responseSchema`
//   buildExtractionPrompt() -> extraction prompt text
//   buildCsv()              -> CSV export (one row per repeating-group row)
//   parseExtractionCsv()    -> reverse of buildCsv (re-import a prior export)
//   recordNeedsEnrichment() -> generic "incomplete data" check
//   blankRecord()           -> empty AnalyzedRecord for a template
//
// `GeminiType` values are byte-for-byte identical to @google/genai's `Type`
// enum, so you can swap them if you prefer importing the SDK enum.
// =============================================================================

import type {
  DisciplineTemplate,
  FieldDef,
  RepeatingGroupDef,
  AnalyzedRecord,
} from '../templateTypes';

const GeminiType = {
  OBJECT: 'OBJECT',
  STRING: 'STRING',
  ARRAY: 'ARRAY',
  BOOLEAN: 'BOOLEAN',
  NUMBER: 'NUMBER',
} as const;

type GeminiSchema = Record<string, any>;

const describe = (f: FieldDef): string =>
  f.example ? `${f.description} Example: ${f.example}` : f.description;

function fieldToSchema(f: FieldDef): GeminiSchema {
  switch (f.type) {
    case 'string[]':
      return { type: GeminiType.ARRAY, items: { type: GeminiType.STRING }, description: describe(f) };
    case 'boolean':
      return { type: GeminiType.BOOLEAN, description: describe(f) };
    case 'number':
      return { type: GeminiType.NUMBER, description: describe(f) };
    default:
      return { type: GeminiType.STRING, description: describe(f) };
  }
}

export const studyFieldsOf = (t: DisciplineTemplate): FieldDef[] =>
  t.sections.flatMap((s) => s.fields);

export const groupsOf = (t: DisciplineTemplate): RepeatingGroupDef[] => t.repeatingGroups ?? [];

function evidenceKeys(t: DisciplineTemplate): string[] {
  const keys: string[] = [];
  for (const f of studyFieldsOf(t)) if (f.evidence) keys.push(f.id);
  for (const g of groupsOf(t)) keys.push(g.id);
  return keys;
}

// ---------------------------------------------------------------------------
// 1. Gemini response schema
// ---------------------------------------------------------------------------
export function buildResponseSchema(t: DisciplineTemplate): GeminiSchema {
  const properties: GeminiSchema = {};
  const required: string[] = [];

  for (const f of studyFieldsOf(t)) {
    properties[f.id] = fieldToSchema(f);
    if (f.required !== false) required.push(f.id);
  }

  for (const g of groupsOf(t)) {
    const itemProps: GeminiSchema = {};
    const itemRequired: string[] = [];
    for (const f of g.fields) {
      itemProps[f.id] = fieldToSchema(f);
      if (f.required !== false) itemRequired.push(f.id);
    }
    properties[g.id] = {
      type: GeminiType.ARRAY,
      description: g.description,
      items: { type: GeminiType.OBJECT, properties: itemProps, required: itemRequired },
    };
    required.push(g.id);
  }

  const evidenceProps: GeminiSchema = {};
  for (const k of evidenceKeys(t)) evidenceProps[k] = { type: GeminiType.STRING };
  properties.evidence = {
    type: GeminiType.OBJECT,
    description:
      'For each key finding, the exact text snippet copied verbatim from the PDF that supports it. Used for verification.',
    properties: evidenceProps,
  };

  return { type: GeminiType.OBJECT, properties, required };
}

// ---------------------------------------------------------------------------
// 1b. Standard JSON Schema (OpenAI Responses `text.format`, Anthropic tool input)
//     Strict-compatible: every property listed in `required`, optionals modelled
//     as anyOf-null, additionalProperties:false on every object.
// ---------------------------------------------------------------------------
export function buildJsonSchema(t: DisciplineTemplate): Record<string, any> {
  const core = (f: FieldDef): Record<string, any> => {
    switch (f.type) {
      case 'string[]': return { type: 'array', items: { type: 'string' } };
      case 'boolean': return { type: 'boolean' };
      case 'number': return { type: 'number' };
      default: return { type: 'string' };
    }
  };
  const prop = (f: FieldDef): Record<string, any> =>
    f.required === false
      ? { anyOf: [core(f), { type: 'null' }], description: describe(f) }
      : { ...core(f), description: describe(f) };

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const f of studyFieldsOf(t)) { properties[f.id] = prop(f); required.push(f.id); }

  for (const g of groupsOf(t)) {
    const itemProps: Record<string, any> = {};
    const itemReq: string[] = [];
    for (const f of g.fields) { itemProps[f.id] = prop(f); itemReq.push(f.id); }
    properties[g.id] = {
      type: 'array',
      description: g.description,
      items: { type: 'object', properties: itemProps, required: itemReq, additionalProperties: false },
    };
    required.push(g.id);
  }

  const evProps: Record<string, any> = {};
  const evReq: string[] = [];
  for (const k of evidenceKeys(t)) { evProps[k] = { anyOf: [{ type: 'string' }, { type: 'null' }] }; evReq.push(k); }
  properties.evidence = { type: 'object', description: 'Verbatim source snippet per field id.', properties: evProps, required: evReq, additionalProperties: false };
  required.push('evidence');

  return { type: 'object', properties, required, additionalProperties: false };
}
export function buildExtractionPrompt(
  t: DisciplineTemplate,
  opts: { focus?: string; existingData?: any; enrich?: boolean } = {}
): string {
  const out: string[] = [];
  out.push(
    `${opts.enrich ? 'SURGICAL ENRICHMENT TASK. ' : ''}Analyze this scientific paper for a "${t.name}" systematic review. ${t.description}`
  );
  out.push(
    `CRITICAL DATA SOURCE CONSTRAINT: Extract ONLY primary data generated within THIS study. Ignore background, secondary references, and data from other studies cited in the text.`
  );
  if (opts.focus && opts.focus.trim()) out.push(`FOCUS: concentrate the extraction on: ${opts.focus.trim()}.`);

  for (const s of t.sections) {
    out.push(`\n## ${s.title}`);
    for (const f of s.fields) out.push(`- ${f.label} ("${f.id}"): ${describe(f)}`);
  }

  for (const g of groupsOf(t)) {
    out.push(`\n## ${g.title} — REPEATING (return an array under "${g.id}")`);
    out.push(g.description);
    out.push(`Each item in the array has these fields:`);
    for (const f of g.fields) out.push(`- ${f.label} ("${f.id}"): ${describe(f)}`);
  }

  out.push(
    `\nFor "evidence", return an object whose keys are field ids above and whose values are the exact source snippet justifying each extraction.`
  );

  if (opts.existingData && Object.keys(opts.existingData).length > 0) {
    out.push(
      `\nExisting partial data to verify and enrich (fill gaps, keep correct values, output a full object): ${JSON.stringify(
        opts.existingData
      )}`
    );
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 3. CSV export
// ---------------------------------------------------------------------------
function escapeCsv(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatVal(v: any): string {
  if (Array.isArray(v)) return v.join('; ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return v === null || v === undefined ? '' : String(v);
}

const EVIDENCE_HEADER = 'Evidence JSON';
const FILENAME_HEADER = 'Filename';
/** Reserved values key used to carry a record's source filename through export/import. */
export const FILENAME_KEY = '__fileName';

/**
 * One CSV row per repeating-group row (a study with 4 soil types => 4 rows).
 * Supports at most one repeating group (all either discipline needs).
 */
export function buildCsv(
  t: DisciplineTemplate,
  records: AnalyzedRecord[],
  opts: { includeEvidence?: boolean; includeFileName?: boolean } = {}
): string {
  const studyFields = studyFieldsOf(t);
  const groups = groupsOf(t);
  if (groups.length > 1) {
    throw new Error(`buildCsv supports at most one repeating group; "${t.id}" declares ${groups.length}.`);
  }
  const primary = groups[0];

  const headers = [
    'Record ID',
    ...(opts.includeFileName ? [FILENAME_HEADER] : []),
    ...studyFields.map((f) => f.label),
    ...(primary ? primary.fields.map((f) => f.label) : []),
    ...(opts.includeEvidence ? [EVIDENCE_HEADER] : []),
  ];

  const rows: string[][] = [];
  records.forEach((rec, recIdx) => {
    const recId = String(rec.values?.id ?? recIdx + 1);
    const fileName = opts.includeFileName ? String(rec.values?.[FILENAME_KEY] ?? '') : null;
    const studyCells = studyFields.map((f) => formatVal(rec.values?.[f.id]));
    const evidenceCell = opts.includeEvidence ? JSON.stringify(rec.evidence ?? {}) : null;
    const groupRows = primary ? rec.groups?.[primary.id] ?? [] : [];

    if (!primary || groupRows.length === 0) {
      rows.push([
        recId,
        ...(fileName !== null ? [fileName] : []),
        ...studyCells,
        ...(primary ? primary.fields.map(() => '') : []),
        ...(evidenceCell !== null ? [evidenceCell] : []),
      ]);
      return;
    }

    groupRows.forEach((gr, i) => {
      const repeat = i === 0 || t.repeatStudyColsOnEveryRow !== false;
      rows.push([
        recId,
        ...(fileName !== null ? [repeat ? fileName : ''] : []),
        ...(repeat ? studyCells : studyCells.map(() => '')),
        ...primary.fields.map((f) => formatVal(gr?.[f.id])),
        ...(evidenceCell !== null ? [i === 0 ? evidenceCell : ''] : []),
      ]);
    });
  });

  return [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
}

// ---------------------------------------------------------------------------
// 4. CSV import (reverse of buildCsv) — re-import a previously exported sheet
// ---------------------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

const clean = (s: string | undefined): string => (s ?? '').trim().replace(/^"|"$/g, '');

/** True if a CSV's header row is a generic extraction export (starts with "Record ID"). */
export function isGenericExtractionCsv(headerLine: string): boolean {
  return parseCsvLine(headerLine).map((h) => h.trim())[0] === 'Record ID';
}

function coerce(field: FieldDef | undefined, raw: string): any {
  const v = clean(raw);
  if (!field) return v;
  if (field.type === 'string[]') return v ? v.split('; ').map((x) => x.trim()).filter(Boolean) : [];
  if (field.type === 'boolean') return v.toLowerCase().includes('yes') || v.toLowerCase() === 'true';
  if (field.type === 'number') return v === '' ? undefined : Number(v);
  return v;
}

export function parseExtractionCsv(t: DisciplineTemplate, text: string): AnalyzedRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const colOf: Record<string, number> = {};
  headers.forEach((h, i) => (colOf[h] = i));

  const studyFields = studyFieldsOf(t);
  const primary = groupsOf(t)[0];
  const labelToStudyField = new Map(studyFields.map((f) => [f.label, f] as const));
  const labelToGroupField = new Map((primary?.fields ?? []).map((f) => [f.label, f] as const));

  const byId = new Map<string, AnalyzedRecord>();
  const order: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const recId = clean(cols[colOf['Record ID']]) || String(i);

    let rec = byId.get(recId);
    if (!rec) {
      rec = { templateId: t.id, values: { id: recId }, groups: primary ? { [primary.id]: [] } : {}, evidence: {} };
      byId.set(recId, rec);
      order.push(recId);
    }

    // study-level values: take the first non-empty occurrence (continuation rows are blank)
    for (const [label, field] of labelToStudyField) {
      const raw = cols[colOf[label]];
      if (raw !== undefined && clean(raw) !== '' && (rec.values[field.id] === undefined || rec.values[field.id] === '' )) {
        rec.values[field.id] = coerce(field, raw);
      }
    }

    // source filename column (not a template field) -> reserved key
    const fnCol = colOf[FILENAME_HEADER];
    if (fnCol !== undefined && clean(cols[fnCol]) && !rec.values[FILENAME_KEY]) {
      rec.values[FILENAME_KEY] = clean(cols[fnCol]);
    }

    // evidence (first row of the record carries it)
    const evCol = colOf[EVIDENCE_HEADER];
    if (evCol !== undefined && clean(cols[evCol]) && (!rec.evidence || Object.keys(rec.evidence).length === 0)) {
      try {
        rec.evidence = JSON.parse(clean(cols[evCol]));
      } catch {
        /* ignore malformed evidence */
      }
    }

    // repeating-group row (only if it has any group content)
    if (primary) {
      const groupRow: Record<string, any> = {};
      let hasContent = false;
      for (const [label, field] of labelToGroupField) {
        const raw = cols[colOf[label]];
        const val = coerce(field, raw ?? '');
        groupRow[field.id] = val;
        if (Array.isArray(val) ? val.length > 0 : val !== '' && val !== undefined) hasContent = true;
      }
      if (hasContent) rec.groups[primary.id].push(groupRow);
    }
  }

  return order.map((id) => byId.get(id)!);
}

// ---------------------------------------------------------------------------
// 5. Helpers used by the UI
// ---------------------------------------------------------------------------
export function blankRecord(t: DisciplineTemplate): AnalyzedRecord {
  const groups: Record<string, any[]> = {};
  for (const g of groupsOf(t)) groups[g.id] = [];
  return { templateId: t.id, values: {}, groups, evidence: {} };
}

const isEmptyValue = (v: any): boolean => {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const s = String(v).trim().toLowerCase();
  return s === '' || s === 'n/a' || s === 'not applicable' || s === 'not measured' || s.includes('not assessed');
};

/** Generic "incomplete data" check: any required study field empty, or a required group empty. */
export function recordNeedsEnrichment(t: DisciplineTemplate, rec?: AnalyzedRecord | null): boolean {
  if (!rec) return false;
  for (const f of studyFieldsOf(t)) {
    if (f.required === false) continue;
    if (isEmptyValue(rec.values?.[f.id])) return true;
  }
  for (const g of groupsOf(t)) {
    const rows = rec.groups?.[g.id] ?? [];
    if (rows.length === 0) return true;
  }
  return false;
}

/**
 * Migrate a legacy flat `AnalyzedPdfData` object (old projects) into the generic
 * AnalyzedRecord shape so existing saved data keeps rendering.
 */
export function migrateLegacyData(templateId: string, data: any): AnalyzedRecord {
  if (!data) return { templateId, values: {}, groups: {}, evidence: {} };
  if (data.values && data.groups) return data as AnalyzedRecord; // already migrated
  const { evidence, ...rest } = data;
  return { templateId, values: rest, groups: {}, evidence: evidence ?? {} };
}
