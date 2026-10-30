
// The generic record shape now lives with the template engine.
export type { AnalyzedRecord } from './templateTypes';

// LEGACY: the original flat toxicity shape. Retained only so old saved projects
// can be migrated (see migrateLegacyData). New code uses AnalyzedRecord.
export interface AnalyzedPdfData {
  title: string;
  studyTypes: string[];
  systems: string[];
  articleType: string;
  exposureDuration: string;
  exposureType: string;
  renewal: string;
  chemicals: string[];
  studySummary: string;
  // New scientific endpoints
  hasTranscriptomics: boolean;
  zebrafishStrain: string;
  testedConcentrations: string[];
  lc50Values: string[];
  ec50Values: string[];
  vtgMeasuredMale?: string;
  vtgDirectionMale?: string;
  vtgConclusionMale?: string;
  vtgMatrixMale?: string;
  vtgTissueMale?: string;
  vtgMeasuredFemale?: string;
  vtgDirectionFemale?: string;
  vtgConclusionFemale?: string;
  vtgMatrixFemale?: string;
  vtgTissueFemale?: string;
  eraExpression?: string;
  erbExpression?: string;
  cyp19aExpression?: string;
  cyp19bExpression?: string;
  estrogenConclusion?: string;
  // Hormone endpoints (Male)
  e2LevelMale?: string;
  tLevelMale?: string;
  kt11LevelMale?: string;
  progLevelMale?: string;
  fshLevelMale?: string;
  lhLevelMale?: string;
  t3LevelMale?: string;
  t4LevelMale?: string;
  cortisolLevelMale?: string;
  e2tRatioMale?: string;
  hormoneConclusionMale?: string;
  hormoneMatrixMale?: string;
  hormoneTissueMale?: string;
  // Hormone endpoints (Female)
  e2LevelFemale?: string;
  tLevelFemale?: string;
  kt11LevelFemale?: string;
  progLevelFemale?: string;
  fshLevelFemale?: string;
  lhLevelFemale?: string;
  t3LevelFemale?: string;
  t4LevelFemale?: string;
  cortisolLevelFemale?: string;
  e2tRatioFemale?: string;
  hormoneConclusionFemale?: string;
  hormoneMatrixFemale?: string;
  hormoneTissueFemale?: string;
  // Neuroendocrine endpoints
  kiss1Expression?: string;
  kiss1rExpression?: string;
  gnrh3Expression?: string;
  neuroendocrineConclusion?: string;
  // Significance fields
  vtgSignificanceMale?: string;
  vtgSignificanceFemale?: string;
  eraSignificance?: string;
  erbSignificance?: string;
  cyp19aSignificance?: string;
  cyp19bSignificance?: string;
  e2LevelSignificanceMale?: string;
  tLevelSignificanceMale?: string;
  kt11LevelSignificanceMale?: string;
  progLevelSignificanceMale?: string;
  fshLevelSignificanceMale?: string;
  lhLevelSignificanceMale?: string;
  t3LevelSignificanceMale?: string;
  t4LevelSignificanceMale?: string;
  cortisolLevelSignificanceMale?: string;
  e2tRatioSignificanceMale?: string;
  e2LevelSignificanceFemale?: string;
  tLevelSignificanceFemale?: string;
  kt11LevelSignificanceFemale?: string;
  progLevelSignificanceFemale?: string;
  fshLevelSignificanceFemale?: string;
  lhLevelSignificanceFemale?: string;
  t3LevelSignificanceFemale?: string;
  t4LevelSignificanceFemale?: string;
  cortisolLevelSignificanceFemale?: string;
  e2tRatioSignificanceFemale?: string;
  kiss1Significance?: string;
  kiss1rSignificance?: string;
  gnrh3Significance?: string;
  evidence?: Record<string, string>;
}

export enum AnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type ReviewStatus = 'INCLUDED' | 'EXCLUDED' | 'NOT_SURE' | 'UNREVIEWED';

export interface CitationRecord {
  id: string; // Typically PMID
  title: string;
  abstract: string;
  doi: string;
  authors: string[];
  journal: string;
  year: string;
  reviewStatus: ReviewStatus;
  aiReviewStatus?: ReviewStatus;
  aiReasoning?: string;
  isAiProcessing?: boolean;
  // Full-text (eligibility) screening — the stage between title/abstract screening and extraction.
  fullTextStatus?: ReviewStatus;
  fullTextReason?: string;
  fullTextFileName?: string; // set when a full-text PDF is attached (blob stored under key `ft_<id>`)
  fullTextAiStatus?: ReviewStatus;        // AI second-reviewer verdict on the full text
  fullTextAiReasoning?: string;
  fullTextAiExclusionReason?: string;     // short PRISMA-style label suggested by the AI (EXCLUDED only)
  fullTextAiError?: string;               // last AI error for this paper (cleared on success)
  isFullTextAiProcessing?: boolean;       // transient; stripped on load
}

import type { AnalyzedRecord } from './templateTypes';

export interface PdfRecord {
  id: number;
  sourceId?: string; // Links back to PMID or DOI
  fileName: string;
  fileSize: number;
  fileUrl: string;
  status: AnalysisStatus;
  data?: AnalyzedRecord;
  errorMessage?: string;
  uploadTimestamp: number;
  reviewStatus: ReviewStatus;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  templateId?: string; // which discipline this project extracts (defaults to toxicity for legacy)
  modelId?: string;    // which AI model this project uses (defaults to the app default)
  createdAt: number;
  lastModified: number;
  citationCount: number;
  pdfCount: number;
}

export interface ProjectState {
  citations: CitationRecord[];
  records: PdfRecord[];
  nextId: number;
  criteria: string;
  fullTextCriteria?: string; // Stage 2 eligibility criteria (optional for older projects)
  targetChemicals?: string;
  templateId?: string;
  modelId?: string;
  stage: 'SCREENING' | 'FULLTEXT' | 'EXTRACTION';
}

export type AppStage = 'PROJECTS' | 'SCREENING' | 'FULLTEXT' | 'EXTRACTION';
