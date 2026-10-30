// =============================================================================
// templateTypes.ts
// -----------------------------------------------------------------------------
// A "discipline" (toxicity, microplastics, ...) is described ONCE as a plain
// data object that conforms to `DisciplineTemplate`. The Gemini schema, the
// extraction prompt, the CSV columns, and the result UI are all GENERATED from
// this object. Adding a discipline = adding one file under templates/.
// =============================================================================

export type FieldType = 'string' | 'string[]' | 'boolean' | 'number';

export interface FieldDef {
  /** machine key used as the object key everywhere. e.g. "identificationMethod" */
  id: string;
  /** human label shown in the UI and used as the CSV header. e.g. "Identification Method" */
  label: string;
  type: FieldType;
  /** Becomes BOTH the Gemini schema description AND a line in the prompt. Write it as an instruction. */
  description: string;
  /** Optional concrete example appended to the description. */
  example?: string;
  /** If false, optional in the response schema + not counted for "needs enrichment". Default true. */
  required?: boolean;
  /** If true, the model is asked for a verbatim source snippet (the "verify in PDF" feature). */
  evidence?: boolean;
  /** Optional UI hint for rendering emphasis. */
  emphasis?: 'summary' | 'badge' | 'normal';
}

/** A grouping of study-level fields -> one section in the result card / viewer. */
export interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
}

/**
 * A repeating sub-table: ONE study produces MANY rows. This is the structural
 * feature toxicity never needed but microplastics does (one row per soil/field
 * type, each with its own Mean/Min/Max/Unit).
 */
export interface RepeatingGroupDef {
  id: string;
  title: string;
  /** Tell the model exactly when to emit a new row. */
  description: string;
  /** Which sub-field labels each row in the UI (e.g. "fieldType"). */
  itemLabelField?: string;
  fields: FieldDef[];
}

export interface DisciplineTemplate {
  id: string;
  name: string;
  /** One-line framing used at the start of the prompt and shown in the UI. */
  description: string;
  sections: SectionDef[];
  repeatingGroups?: RepeatingGroupDef[];
  defaultCriteria?: string;
  /** Optional comma-separated "focus terms" hint shown next to the focus input. */
  focusHint?: string;
  /**
   * CSV behaviour for repeating rows.
   *  true  -> repeat study columns on every measurement row (analysis-friendly, default)
   *  false -> blank study columns on continuation rows (mirrors a typical extraction sheet)
   */
  repeatStudyColsOnEveryRow?: boolean;
}

// -----------------------------------------------------------------------------
// The single generic shape that REPLACES the ~90-field `AnalyzedPdfData`.
//   values  -> study-level fields keyed by FieldDef.id
//   groups  -> repeating rows keyed by RepeatingGroupDef.id
// -----------------------------------------------------------------------------
export interface AnalyzedRecord {
  templateId: string;
  values: Record<string, any>;
  groups: Record<string, Array<Record<string, any>>>;
  evidence?: Record<string, string>;
}
