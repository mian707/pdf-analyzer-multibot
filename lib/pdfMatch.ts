// Match a batch of local PDF files to items (papers) that still need one.
// Same scoring as the Extraction-stage folder linker: exact/near filename,
// DOI or PMID embedded in the filename, and title similarity. Greedy best-first
// assignment so each PDF and each item is used at most once.

export interface MatchTarget {
  key: string;            // stable id of the item (e.g. citation id)
  ids: string[];          // identifiers that may appear in a filename (DOI, PMID)
  texts: string[];        // titles / previous filenames to compare against
}

const stripExt = (n: string) => (n.split(/[\\/]/).pop() || n).replace(/\.pdf$/i, '');
const alnum = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const tokens = (s: string) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4);

/** Similarity between a candidate string (title/filename) and a PDF base name, 0..1. */
export const similarity = (candidate: string, fileBase: string): number => {
  const c = alnum(candidate), f = alnum(fileBase);
  if (!c || !f) return 0;
  if (c === f) return 1;
  const shorter = c.length <= f.length ? c : f;
  const longer = c.length <= f.length ? f : c;
  if (shorter.length >= 8 && longer.includes(shorter)) {
    return 0.75 + 0.25 * (shorter.length / longer.length); // strong substring match
  }
  const ct = new Set(tokens(candidate));
  const ft = new Set(tokens(fileBase));
  if (ct.size === 0 || ft.size === 0) return 0;
  let inter = 0; ct.forEach(t => { if (ft.has(t)) inter++; });
  const union = new Set([...ct, ...ft]).size;
  return inter / union; // token Jaccard
};

export function matchPdfsToTargets(
  files: File[],
  targets: MatchTarget[],
  threshold = 0.45
): Map<string, File> {
  const pdfs = files.map(f => ({ file: f, base: stripExt(f.name), alnum: alnum(stripExt(f.name)) }));
  type Cand = { key: string; pdfIdx: number; score: number };
  const cands: Cand[] = [];

  for (const t of targets) {
    const idNorms = t.ids.map(alnum).filter(x => x.length >= 6);
    pdfs.forEach((p, pdfIdx) => {
      let score = 0;
      if (idNorms.some(id => p.alnum.includes(id))) score = 0.97;            // DOI / PMID in filename
      for (const txt of t.texts) if (txt) score = Math.max(score, similarity(txt, p.base));
      if (score >= threshold) cands.push({ key: t.key, pdfIdx, score });
    });
  }

  cands.sort((a, b) => b.score - a.score);
  const usedPdf = new Set<number>();
  const result = new Map<string, File>();
  for (const c of cands) {
    if (usedPdf.has(c.pdfIdx) || result.has(c.key)) continue;
    usedPdf.add(c.pdfIdx);
    result.set(c.key, pdfs[c.pdfIdx].file);
  }
  return result;
}
