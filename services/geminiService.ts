import { ReviewStatus, AnalyzedRecord } from "../types";
import type { DisciplineTemplate } from "../templateTypes";
import { buildResponseSchema, buildJsonSchema, buildExtractionPrompt, studyFieldsOf, groupsOf } from "../lib/buildFromTemplate";
import { getProvider, getApiKeyFor, type AiModel } from "../providers";
import { withRetry } from "../providers/util";

// Read a File/Blob into raw base64 (no data: prefix). Each provider re-wraps as needed.
const fileToBase64 = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const mimeOf = (file: File | Blob) => (file as File).type || "application/pdf";

/** Split the flat object a model returns into the generic AnalyzedRecord shape. */
function responseToRecord(template: DisciplineTemplate, raw: any): AnalyzedRecord {
  const values: Record<string, any> = {};
  const groups: Record<string, any[]> = {};
  for (const f of studyFieldsOf(template)) if (raw?.[f.id] !== undefined && raw[f.id] !== null) values[f.id] = raw[f.id];
  for (const g of groupsOf(template)) groups[g.id] = Array.isArray(raw?.[g.id]) ? raw[g.id] : [];
  return { templateId: template.id, values, groups, evidence: raw?.evidence ?? {} };
}

async function runExtraction(
  file: File | Blob,
  template: DisciplineTemplate,
  model: AiModel,
  opts: { focus?: string; existingData?: AnalyzedRecord; enrich?: boolean } = {}
): Promise<AnalyzedRecord> {
  const pdfBase64 = await fileToBase64(file);
  const existingFlat = opts.existingData ? { ...opts.existingData.values, ...opts.existingData.groups } : undefined;
  const prompt = buildExtractionPrompt(template, { focus: opts.focus, existingData: existingFlat, enrich: opts.enrich });

  const provider = getProvider(model.providerId);
  const schema = provider.schemaFlavor === "gemini" ? buildResponseSchema(template) : buildJsonSchema(template);
  const apiKey = getApiKeyFor(model.providerId);

  const raw = await withRetry(() =>
    provider.run({ prompt, schema, pdfBase64, mimeType: mimeOf(file), model: model.model, apiKey })
  );
  return responseToRecord(template, raw);
}

export const analyzePdfContent = async (
  file: File | Blob,
  template: DisciplineTemplate,
  model: AiModel,
  opts: { focus?: string; existingData?: AnalyzedRecord } = {}
): Promise<AnalyzedRecord> => runExtraction(file, template, model, opts);

export const enrichPdfContent = async (
  file: File | Blob,
  template: DisciplineTemplate,
  existingData: AnalyzedRecord,
  model: AiModel,
  opts: { focus?: string } = {}
): Promise<AnalyzedRecord> =>
  runExtraction(file, template, model, { focus: opts.focus, existingData, enrich: true });

// Screening schema in both dialects (template-independent).
const SCREEN_SCHEMA_GEMINI = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", description: "Recommendation: 'INCLUDED', 'EXCLUDED', or 'NOT_SURE'." },
    reasoning: { type: "STRING", description: "A concise explanation (1-2 sentences)." },
  },
  required: ["verdict", "reasoning"],
};
const SCREEN_SCHEMA_JSON = {
  type: "object",
  properties: {
    verdict: { type: "string", description: "Recommendation: 'INCLUDED', 'EXCLUDED', or 'NOT_SURE'." },
    reasoning: { type: "string", description: "A concise explanation (1-2 sentences)." },
  },
  required: ["verdict", "reasoning"],
  additionalProperties: false,
};

export const screenCitation = async (
  title: string,
  abstract: string,
  criteria: string,
  model: AiModel
): Promise<{ verdict: ReviewStatus; reasoning: string }> => {
  const prompt = `Review study for inclusion: "${title}"
Abstract: "${abstract}"
Inclusion Criteria: "${criteria}"

Respond with JSON containing "verdict" ('INCLUDED', 'EXCLUDED', or 'NOT_SURE') and "reasoning".`;

  const provider = getProvider(model.providerId);
  const schema = provider.schemaFlavor === "gemini" ? SCREEN_SCHEMA_GEMINI : SCREEN_SCHEMA_JSON;
  const apiKey = getApiKeyFor(model.providerId);

  const raw = await withRetry(() => provider.run({ prompt, schema, model: model.model, apiKey }));
  return { verdict: raw.verdict as ReviewStatus, reasoning: raw.reasoning };
};

// ---- Full-text (eligibility) screening -------------------------------------
// Same idea as screenCitation, but the model reads the attached full-text PDF and
// judges it against the Stage 2 eligibility criteria.

const FT_VERDICT_DESC = "Eligibility decision: 'INCLUDED', 'EXCLUDED', or 'NOT_SURE'.";
const FT_REASONING_DESC = "2-4 sentences naming the specific criteria met or failed, with the supporting detail from the paper (e.g. species, design, dose, endpoint, section).";
const FT_EXCL_DESC = "If EXCLUDED: a short PRISMA-style exclusion reason (max ~8 words, e.g. 'Wrong study design: review'). Otherwise an empty string.";

const FT_SCHEMA_GEMINI = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", description: FT_VERDICT_DESC },
    reasoning: { type: "STRING", description: FT_REASONING_DESC },
    exclusion_reason: { type: "STRING", description: FT_EXCL_DESC },
  },
  required: ["verdict", "reasoning", "exclusion_reason"],
};
const FT_SCHEMA_JSON = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["INCLUDED", "EXCLUDED", "NOT_SURE"], description: FT_VERDICT_DESC },
    reasoning: { type: "string", description: FT_REASONING_DESC },
    exclusion_reason: { type: "string", description: FT_EXCL_DESC },
  },
  required: ["verdict", "reasoning", "exclusion_reason"],
  additionalProperties: false,
};

const normalizeVerdict = (v: any): ReviewStatus => {
  const s = String(v || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (s.startsWith("INCLU")) return "INCLUDED";
  if (s.startsWith("EXCLU")) return "EXCLUDED";
  return "NOT_SURE";
};

export const screenFullText = async (
  pdf: File | Blob,
  title: string,
  criteria: string,
  model: AiModel
): Promise<{ verdict: ReviewStatus; reasoning: string; exclusionReason: string }> => {
  const prompt = `You are the second reviewer in the FULL-TEXT (eligibility) stage of a systematic review.
The attached PDF should be the full text of: "${title}"

Full-text eligibility criteria:
"""
${criteria}
"""

Instructions:
- Judge the study against EVERY criterion using the full text (methods and results, not only the abstract).
- INCLUDED: all inclusion criteria are met and no exclusion criterion applies.
- EXCLUDED: at least one criterion clearly fails; name it.
- NOT_SURE: the paper does not report enough to decide, the PDF is unreadable/incomplete, or the PDF does not appear to be the paper titled above (say so).
- Base the decision only on the document; do not guess missing information.

Respond with JSON containing "verdict", "reasoning", and "exclusion_reason".`;

  const provider = getProvider(model.providerId);
  const schema = provider.schemaFlavor === "gemini" ? FT_SCHEMA_GEMINI : FT_SCHEMA_JSON;
  const apiKey = getApiKeyFor(model.providerId);
  const pdfBase64 = await fileToBase64(pdf);

  const raw = await withRetry(() =>
    provider.run({ prompt, schema, pdfBase64, mimeType: "application/pdf", model: model.model, apiKey })
  );
  const verdict = normalizeVerdict(raw?.verdict);
  return {
    verdict,
    reasoning: String(raw?.reasoning || ""),
    exclusionReason: verdict === "EXCLUDED" ? String(raw?.exclusion_reason || "") : "",
  };
};

// ---- PDF retrieval helpers (unchanged) ------------------------------------

export const fetchOpenAccessPdfUrl = async (doi: string): Promise<string | null> => {
  try {
    const cleanDoi = doi.replace("https://doi.org/", "").trim();
    const response = await fetch(`https://api.unpaywall.org/v2/${cleanDoi}?email=support@bioreviewpro.com`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.best_oa_location?.url_for_pdf || null;
  } catch (error) {
    console.error("Unpaywall fetch error:", error);
    return null;
  }
};

export const fetchElsevierPdfBlob = async (doi: string, apiKey: string, instToken: string): Promise<Blob | null> => {
  try {
    const cleanDoi = doi.replace("https://doi.org/", "").trim();
    const url = `/api/elsevier-proxy?doi=${encodeURIComponent(cleanDoi)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-ELS-APIKey": apiKey, "X-ELS-Insttoken": instToken, Accept: "application/pdf" },
    });
    if (response.ok) {
      const blob = await response.blob();
      if (blob.type === "application/pdf" || blob.size > 1000) return blob;
    } else {
      console.error(`Elsevier Proxy responded with ${response.status}: ${response.statusText}`);
    }
    return null;
  } catch (e) {
    console.error("Elsevier PDF fetch error:", e);
    return null;
  }
};

export const downloadPdfBlob = async (url: string): Promise<Blob | null> => {
  try {
    const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxiedUrl);
    if (response.ok) return await response.blob();
    return null;
  } catch (e) {
    console.error("PDF download error:", e);
    return null;
  }
};
