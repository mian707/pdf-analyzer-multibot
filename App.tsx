import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Download, Search, Microscope, 
  Database, Sparkles, BrainCircuit, Loader2, AlertTriangle, 
  RefreshCw, LayoutGrid, Calendar, ChevronRight, Edit3, FolderOpen, ArrowLeft, X,
  FileDown, CheckCircle2, PieChart, BarChart3, Upload, FilterX, Link2, BookOpen, ExternalLink, FileQuestion, List, FolderPlus, Wand2, Settings, Key, Shield, FileText, ListChecks
} from 'lucide-react';
import { PdfRecord, AnalysisStatus, ReviewStatus, AppStage, CitationRecord, ProjectMetadata, ProjectState, AnalyzedRecord } from './types';
import { analyzePdfContent, screenCitation, screenFullText, fetchOpenAccessPdfUrl, downloadPdfBlob, enrichPdfContent, fetchElsevierPdfBlob } from './services/geminiService';
import { AI_MODELS, DEFAULT_MODEL_ID, getModel, hasApiKeyFor } from './providers';
import { PdfCard } from './components/PdfCard';
import { CitationCard } from './components/CitationCard';
import { FullTextCard } from './components/FullTextCard';
import { matchPdfsToTargets } from './lib/pdfMatch';
import { passesTitleAbstract, isTitleAbstractConflict, isFullTextConflict } from './lib/screeningRules';
import { EmptyState } from './components/EmptyState';
import { PdfViewer } from './components/PdfViewer';
import { saveBlob, getBlob, deleteProjectBlobs, saveProjectState, getProjectState } from './lib/db';
import { getTemplate, listTemplates, DEFAULT_TEMPLATE_ID } from './templates';
import { buildCsv, parseExtractionCsv, isGenericExtractionCsv, studyFieldsOf, blankRecord, migrateLegacyData, recordNeedsEnrichment } from './lib/buildFromTemplate';

const PROJECTS_MANIFEST_KEY = 'bio_review_pro_manifest';
const PROJECT_STATE_PREFIX = 'bio_review_project_';
const ELSEVIER_KEY_STORAGE = 'elsevier_api_key';
const ELSEVIER_INST_STORAGE = 'elsevier_inst_token';

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

// Helper for robust title comparison
const normalizeText = (text: string | undefined | null) => {
  if (!text) return "";
  return String(text).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
};

interface ModalConfig {
  type: 'INPUT' | 'CONFIRM' | 'SETTINGS' | 'CREATE';
  title: string;
  message?: string;
  initialValue?: string;
  onConfirm: (data?: any) => void;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
}

const App: React.FC = () => {
  // Bulk AI stop control
  const [isBulkStopRequested, setIsBulkStopRequested] = useState(false);
  const bulkStopRef = useRef(false);

  // Full-text bulk AI has its own stop control so it can't interfere with Stage 1's loop.
  const [isFtBulkRunning, setIsFtBulkRunning] = useState(false);
  const [isFtStopRequested, setIsFtStopRequested] = useState(false);
  const ftStopRef = useRef(false);
  const requestStopFtBulk = () => {
    ftStopRef.current = true;
    setIsFtStopRequested(true);
  };

  const requestStopBulkAi = () => {
    bulkStopRef.current = true;          // immediate for the running loop
    setIsBulkStopRequested(true);        // for UI label/disabled state
  };

  const [stage, setStage] = useState<AppStage>('PROJECTS');
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const [criteria, setCriteria] = useState<string>("Include primary research studies evaluating toxicity. Exclude reviews, editorials, and case reports.");
  const [fullTextCriteria, setFullTextCriteria] = useState<string>("");
  const [targetChemicals, setTargetChemicals] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const activeModel = useMemo(() => getModel(modelId), [modelId]);
  const template = useMemo(() => getTemplate(templateId), [templateId]);
  const [modalTemplateId, setModalTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const modalTemplateIdRef = useRef<string>(DEFAULT_TEMPLATE_ID);
  const setModalTemplate = (id: string) => { setModalTemplateId(id); modalTemplateIdRef.current = id; };

  // Title of a record, derived from whichever field looks like the title for the active template.
  const recordTitle = (rec?: AnalyzedRecord | null): string => {
    if (!rec) return '';
    const fields = studyFieldsOf(template);
    const f = fields.find((x) => /title/i.test(x.id)) || fields[0];
    return f ? String(rec.values?.[f.id] ?? '') : '';
  };

  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [records, setRecords] = useState<PdfRecord[]>([]);
  const [nextId, setNextId] = useState<number>(1);
  const [elsevierApiKey, setElsevierApiKey] = useState<string>("");
  const [elsevierInstToken, setElsevierInstToken] = useState<string>("");
  
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  useEffect(() => { setActiveFilter(null); }, [stage]);
  const [isAiBulkRunning, setIsAiBulkRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isBulkEnriching, setIsBulkEnriching] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<PdfRecord | null>(null);
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [modalInputValue, setModalInputValue] = useState("");
  const [modalInstValue, setModalInstValue] = useState("");
  
  const [uploadTargetCitation, setUploadTargetCitation] = useState<CitationRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pubmedInputRef = useRef<HTMLInputElement>(null);
  const csvImportInputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Stage 2 (full-text) bulk PDF attach: folder / multi-file pickers + DOI auto-fetch loop.
  const ftFolderInputRef = useRef<HTMLInputElement>(null);
  const ftFilesInputRef = useRef<HTMLInputElement>(null);
  const [isFtBulkFetching, setIsFtBulkFetching] = useState(false);
  const [ftFetchProgress, setFtFetchProgress] = useState<{ done: number; total: number } | null>(null);
  const ftFetchStopRef = useRef(false);
  const [isFtFetchStopRequested, setIsFtFetchStopRequested] = useState(false);
  const fullTextInputRef = useRef<HTMLInputElement>(null);
  const fullTextTargetRef = useRef<CitationRecord | null>(null);
  const [fullTextUrls, setFullTextUrls] = useState<Record<string, string>>({});
  const [isFetchingFT, setIsFetchingFT] = useState<Record<string, boolean>>({});
  const [viewingFullText, setViewingFullText] = useState<{ url: string; fileName: string } | null>(null);

  // CRITICAL: Refs to maintain consistent state inside long-running async loops
  const citationsRef = useRef<CitationRecord[]>([]);
  const recordsRef = useRef<PdfRecord[]>([]);
  const criteriaRef = useRef<string>(criteria);
  const fullTextCriteriaRef = useRef<string>(fullTextCriteria);
  const currentProjectRef = useRef<ProjectMetadata | null>(currentProject);
  const activeModelRef = useRef(activeModel);

  // Immediate sync functions to bypass React's asynchronous render cycle for loops
  const setCitationsWithRef = (val: CitationRecord[] | ((prev: CitationRecord[]) => CitationRecord[])) => {
    setCitations(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      citationsRef.current = next;
      return next;
    });
  };

  const setRecordsWithRef = (val: PdfRecord[] | ((prev: PdfRecord[]) => PdfRecord[])) => {
    setRecords(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      recordsRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    criteriaRef.current = criteria;
  }, [criteria]);

  useEffect(() => {
    fullTextCriteriaRef.current = fullTextCriteria;
  }, [fullTextCriteria]);

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  useEffect(() => {
    const savedManifest = localStorage.getItem(PROJECTS_MANIFEST_KEY);
    const savedElsevierKey = localStorage.getItem(ELSEVIER_KEY_STORAGE);
    const savedElsevierInst = localStorage.getItem(ELSEVIER_INST_STORAGE);
    if (savedManifest) {
      try {
        setProjects(JSON.parse(savedManifest));
      } catch (e) {
        console.error("Failed to load project manifest", e);
      }
    }
    if (savedElsevierKey) setElsevierApiKey(savedElsevierKey);
    if (savedElsevierInst) setElsevierInstToken(savedElsevierInst);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(PROJECTS_MANIFEST_KEY, JSON.stringify(projects));
      localStorage.setItem(ELSEVIER_KEY_STORAGE, elsevierApiKey);
      localStorage.setItem(ELSEVIER_INST_STORAGE, elsevierInstToken);
    }
  }, [projects, isHydrated, elsevierApiKey, elsevierInstToken]);

  useEffect(() => {
    setActiveFilter(null);
  }, [stage]);

  useEffect(() => {
    if (modal?.type === 'INPUT' && modalInputRef.current) {
      modalInputRef.current.focus();
      modalInputRef.current.select();
    }
  }, [modal]);

  useEffect(() => {
    if (!currentProject || !isHydrated || stage === 'PROJECTS') return;

    const stateToSave: ProjectState = {
      citations,
      records: records.map(({ fileUrl, ...rest }) => rest as PdfRecord),
      nextId,
      criteria,
      fullTextCriteria,
      targetChemicals,
      templateId,
      modelId,
      stage: stage as 'SCREENING' | 'FULLTEXT' | 'EXTRACTION'
    };

    saveProjectState(currentProject.id, stateToSave).catch(err => {
      console.error("Failed to save project state to IndexedDB", err);
    });
    
    setProjects(prev => prev.map(p => p.id === currentProject.id ? { 
      ...p, 
      lastModified: Date.now(),
      citationCount: citations.length,
      pdfCount: records.length
    } : p));
  }, [criteria, fullTextCriteria, stage, citations, records, nextId, currentProject, isHydrated]);

  const openCreateModal = () => {
    setModalInputValue("New Research Project");
    setModalTemplate(DEFAULT_TEMPLATE_ID);
    setModal({
      type: 'CREATE',
      title: "Create New Project",
      initialValue: "New Research Project",
      confirmLabel: "Create Project",
      onConfirm: (name) => {
        if (!name) return;
        const chosenId = modalTemplateIdRef.current || DEFAULT_TEMPLATE_ID;
        const chosen = getTemplate(chosenId);
        const newProject: ProjectMetadata = {
          id: generateId(),
          name,
          templateId: chosenId,
          modelId,
          createdAt: Date.now(),
          lastModified: Date.now(),
          citationCount: 0,
          pdfCount: 0
        };
        setProjects(prev => [newProject, ...prev]);
        setTemplateId(chosenId);
        setCriteria(chosen.defaultCriteria || "Include primary research studies. Exclude reviews, editorials, and case reports.");
        setFullTextCriteria("");
        setTargetChemicals("");
        setCitationsWithRef([]);
        setRecordsWithRef([]);
        setNextId(1);
        setStage('SCREENING');
        setCurrentProject(newProject);
        setModal(null);
      }
    });
  };

  const openSettingsModal = () => {
    setModalInputValue(elsevierApiKey);
    setModalInstValue(elsevierInstToken);
    setModal({
      type: 'SETTINGS',
      title: "API Configurations",
      confirmLabel: "Save Settings",
      onConfirm: () => {
        setElsevierApiKey(modalInputValue || "");
        setElsevierInstToken(modalInstValue || "");
        setModal(null);
      }
    });
  };

  const openRenameModal = (project: ProjectMetadata) => {
    setModalInputValue(project.name);
    setModal({
      type: 'INPUT',
      title: "Rename Project",
      initialValue: project.name,
      confirmLabel: "Save Changes",
      onConfirm: (newName) => {
        if (!newName) return;
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, name: newName } : p));
        if (currentProject?.id === project.id) {
          setCurrentProject({ ...currentProject, name: newName });
        }
        setModal(null);
      }
    });
  };

  const openDeleteModal = (projectId: string) => {
    setModal({
      type: 'CONFIRM',
      title: "Delete Project",
      message: "Are you sure you want to delete this project and all its data? This action cannot be undone.",
      confirmLabel: "Delete Project",
      variant: 'danger',
      onConfirm: async () => {
        await deleteProjectBlobs(projectId);
        setProjects(prev => prev.filter(p => p.id !== projectId));
        if (currentProject?.id === projectId) {
          setCurrentProject(null);
          setStage('PROJECTS');
        }
        setModal(null);
      }
    });
  };

  const loadProject = async (project: ProjectMetadata) => {
    const savedState = await getProjectState(project.id);
    
    records.forEach(r => {
      if (r.fileUrl && r.fileUrl.startsWith('blob:')) {
        URL.revokeObjectURL(r.fileUrl);
      }
    });

    if (savedState) {
      try {
        const parsed: ProjectState = savedState;
        const tid = parsed.templateId || project.templateId || DEFAULT_TEMPLATE_ID;
        setTemplateId(tid);
        setModelId(parsed.modelId || project.modelId || DEFAULT_MODEL_ID);
        setCriteria(parsed.criteria);
        setFullTextCriteria(parsed.fullTextCriteria || "");
        setTargetChemicals(parsed.targetChemicals || "");
        setCitationsWithRef(parsed.citations.map(c => ({ ...c, isFullTextAiProcessing: false })));
        setNextId(parsed.nextId);
        setStage(parsed.stage || 'SCREENING');
        
        const hydratedRecords = await Promise.all(parsed.records.map(async (record) => {
          const blob = await getBlob(project.id, record.id);
          const data = record.data ? migrateLegacyData(tid, record.data) : record.data;
          return { ...record, data, fileUrl: blob ? URL.createObjectURL(blob) : '' };
        }));
        setRecordsWithRef(hydratedRecords);
      } catch (e) {
        console.error("Failed to load project state", e);
        resetToDefaultState(project.templateId);
      }
    } else {
      // Fallback for legacy localStorage data
      const legacyState = localStorage.getItem(`${PROJECT_STATE_PREFIX}${project.id}`);
      if (legacyState) {
        try {
          const parsed: ProjectState = JSON.parse(legacyState);
          const tid = parsed.templateId || project.templateId || DEFAULT_TEMPLATE_ID;
          setTemplateId(tid);
          setModelId(parsed.modelId || project.modelId || DEFAULT_MODEL_ID);
          setCriteria(parsed.criteria);
          setFullTextCriteria(parsed.fullTextCriteria || "");
          setCitationsWithRef(parsed.citations.map(c => ({ ...c, isFullTextAiProcessing: false })));
          setNextId(parsed.nextId);
          setStage(parsed.stage || 'SCREENING');
          
          const hydratedRecords = await Promise.all(parsed.records.map(async (record) => {
            const blob = await getBlob(project.id, record.id);
            const data = record.data ? migrateLegacyData(tid, record.data) : record.data;
            return { ...record, data, fileUrl: blob ? URL.createObjectURL(blob) : '' };
          }));
          setRecordsWithRef(hydratedRecords);
          
          // Migrate to IndexedDB
          await saveProjectState(project.id, parsed);
          localStorage.removeItem(`${PROJECT_STATE_PREFIX}${project.id}`);
        } catch (e) {
          resetToDefaultState(project.templateId);
        }
      } else {
        resetToDefaultState(project.templateId);
      }
    }

    setCurrentProject(project);
  };

  const resetToDefaultState = (tid?: string) => {
    const resolved = tid || DEFAULT_TEMPLATE_ID;
    setTemplateId(resolved);
    setCriteria(getTemplate(resolved).defaultCriteria || "Include primary research studies. Exclude reviews, editorials, and case reports.");
    setFullTextCriteria("");
    setTargetChemicals("");
    setCitationsWithRef([]);
    setRecordsWithRef([]);
    setNextId(1);
    setStage('SCREENING');
  };

  const escapeCsvValue = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const exportToCsv = () => {
    let csvContent = "";
    let filename = "";

    if (stage === 'SCREENING') {
      const headers = ["ID", "Title", "Year", "Journal", "DOI", "Authors", "Abstract", "User Status", "AI Status", "AI Reasoning", "Full Text Status", "Full Text Reason", "Full Text File", "Full Text AI Status", "Full Text AI Reasoning", "Full Text AI Exclusion Reason"];
      const escapedHeaders = headers.map(escapeCsvValue);
      
      const rows = citations.map(c => [
        escapeCsvValue(c.id),
        escapeCsvValue(c.title),
        escapeCsvValue(c.year),
        escapeCsvValue(c.journal),
        escapeCsvValue(c.doi || ''),
        escapeCsvValue(c.authors.join('; ')),
        escapeCsvValue(c.abstract || ''),
        escapeCsvValue(c.reviewStatus),
        escapeCsvValue(c.aiReviewStatus || 'N/A'),
        escapeCsvValue(c.aiReasoning || 'N/A'),
        escapeCsvValue(c.fullTextStatus || 'N/A'),
        escapeCsvValue(c.fullTextReason || ''),
        escapeCsvValue(c.fullTextFileName || ''),
        escapeCsvValue(c.fullTextAiStatus || 'N/A'),
        escapeCsvValue(c.fullTextAiReasoning || ''),
        escapeCsvValue(c.fullTextAiExclusionReason || '')
      ]);
      
      csvContent = [escapedHeaders, ...rows].map(e => e.join(",")).join("\n");
      filename = `${currentProject?.name}_Screening_Results.csv`;
    } else if (stage === 'FULLTEXT') {
      // Full-text (eligibility) results: only papers that passed title/abstract.
      // Full-text columns first for readability; Stage 1 columns kept at the end so
      // this file can be re-imported via "Import results" without losing anything.
      const headers = [
        "ID", "Title", "Year", "Journal", "DOI", "Authors",
        "Full Text Status", "Full Text Reason",
        "Full Text AI Status", "Full Text AI Reasoning", "Full Text AI Exclusion Reason", "Human-AI Agreement",
        "Full Text File",
        "User Status", "AI Status", "AI Reasoning", "Abstract"
      ];
      const agreement = (c: CitationRecord) => {
        const human = c.fullTextStatus && c.fullTextStatus !== 'UNREVIEWED' ? c.fullTextStatus : null;
        const ai = c.fullTextAiStatus || null;
        if (!human || !ai) return human ? 'No AI verdict' : ai ? 'Not reviewed by human' : '';
        if (ai === 'NOT_SURE' || human === 'NOT_SURE') return 'Uncertain';
        return human === ai ? 'Agree' : 'Conflict';
      };
      const rows = fullTextCitations.map(c => [
        c.id, c.title, c.year, c.journal, c.doi || '', c.authors.join('; '),
        c.fullTextStatus || 'UNREVIEWED', c.fullTextReason || '',
        c.fullTextAiStatus || 'N/A', c.fullTextAiReasoning || '', c.fullTextAiExclusionReason || '', agreement(c),
        c.fullTextFileName || '',
        c.reviewStatus, c.aiReviewStatus || 'N/A', c.aiReasoning || 'N/A', c.abstract || ''
      ].map(escapeCsvValue));

      csvContent = [headers.map(escapeCsvValue), ...rows].map(e => e.join(",")).join("\n");
      filename = `${currentProject?.name}_FullText_Screening_Results.csv`;
    } else {
      // Generated entirely from the active discipline template (schema-free).
      const recs: AnalyzedRecord[] = records
        .filter(r => r.data)
        .map(r => ({ ...(r.data as AnalyzedRecord), values: { id: r.id, __fileName: r.fileName, ...(r.data as AnalyzedRecord).values } }));
      csvContent = buildCsv(template, recs, { includeEvidence: true, includeFileName: true });
      filename = `${currentProject?.name}_Extraction_Results.csv`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split(/\r?\n/);
      if (lines.length < 2) return;

      const headers = lines[0].split(",");
      const trimmedHeaders = headers.map(h => h.trim().replace(/^"|"$/g, ''));
      
      const parseCsvLine = (line: string) => {
        const result = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"' && line[i + 1] === '"') {
            current += '"';
            i++;
          } else if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };

      const colMap: Record<string, number> = {};
      trimmedHeaders.forEach((h, i) => colMap[h] = i);

      const isScreening = trimmedHeaders.includes("Title") && trimmedHeaders.includes("User Status");
      const isExtraction = isGenericExtractionCsv(lines[0]) || (trimmedHeaders.includes("Filename") && trimmedHeaders.includes("Article Type"));

      if (!isScreening && !isExtraction) {
        alert("Invalid CSV format. Please ensure you are uploading a CSV exported from BioReview Pro.");
        return;
      }

      if (isScreening) {
        const importedCitations: CitationRecord[] = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const cols = parseCsvLine(lines[i]);
          
          const citation: CitationRecord = {
            id: (cols[colMap["ID"]] || cols[colMap["PMID"]] || generateId()).trim().replace(/^"|"$/g, ''),
            title: (cols[colMap["Title"]] || "").trim().replace(/^"|"$/g, ''),
            year: (cols[colMap["Year"]] || "").trim().replace(/^"|"$/g, ''),
            journal: (cols[colMap["Journal"]] || "").trim().replace(/^"|"$/g, ''),
            authors: cols[colMap["Authors"]] ? cols[colMap["Authors"]].trim().replace(/^"|"$/g, '').split("; ") : [],
            abstract: (cols[colMap["Abstract"]] || "").trim().replace(/^"|"$/g, ''),
            doi: (cols[colMap["DOI"]] || "").trim().replace(/^"|"$/g, ''),
            reviewStatus: (cols[colMap["User Status"]] || 'UNREVIEWED').trim().replace(/^"|"$/g, '') as ReviewStatus,
            aiReviewStatus: (cols[colMap["AI Status"]] === 'N/A' ? undefined : cols[colMap["AI Status"]]) as ReviewStatus | undefined,
            aiReasoning: cols[colMap["AI Reasoning"]] === 'N/A' ? undefined : cols[colMap["AI Reasoning"]],
            fullTextStatus: (colMap["Full Text Status"] !== undefined && cols[colMap["Full Text Status"]] && cols[colMap["Full Text Status"]].trim().replace(/^"|"$/g, '') !== 'N/A')
              ? cols[colMap["Full Text Status"]].trim().replace(/^"|"$/g, '') as ReviewStatus
              : undefined,
            fullTextReason: colMap["Full Text Reason"] !== undefined ? (cols[colMap["Full Text Reason"]] || '').trim().replace(/^"|"$/g, '') || undefined : undefined,
            fullTextFileName: colMap["Full Text File"] !== undefined ? (cols[colMap["Full Text File"]] || '').trim().replace(/^"|"$/g, '') || undefined : undefined,
            fullTextAiStatus: (colMap["Full Text AI Status"] !== undefined && cols[colMap["Full Text AI Status"]] && cols[colMap["Full Text AI Status"]].trim().replace(/^"|"$/g, '') !== 'N/A')
              ? cols[colMap["Full Text AI Status"]].trim().replace(/^"|"$/g, '') as ReviewStatus
              : undefined,
            fullTextAiReasoning: colMap["Full Text AI Reasoning"] !== undefined ? (cols[colMap["Full Text AI Reasoning"]] || '').trim().replace(/^"|"$/g, '') || undefined : undefined,
            fullTextAiExclusionReason: colMap["Full Text AI Exclusion Reason"] !== undefined ? (cols[colMap["Full Text AI Exclusion Reason"]] || '').trim().replace(/^"|"$/g, '') || undefined : undefined
          };
          importedCitations.push(citation);
        }

        setCitationsWithRef(prev => {
          const existingMap = new Map<string, CitationRecord>(prev.map(c => [c.id, c]));
          importedCitations.forEach(imp => {
            if (existingMap.has(imp.id)) {
              const existing = existingMap.get(imp.id)!;
              existingMap.set(imp.id, { 
                ...existing, 
                ...imp, 
                abstract: imp.abstract || existing.abstract,
                doi: imp.doi || existing.doi
              });
            } else {
              existingMap.set(imp.id, imp);
            }
          });
          return Array.from(existingMap.values());
        });
        alert(`Successfully imported ${importedCitations.length} screening records.`);
      } else {
        // Reconstruct generic records from a prior template export.
        const imported = parseExtractionCsv(template, content);
        let maxImportedId = 0;
        const startIndex = nextId;
        const importedRecords: PdfRecord[] = imported.map((rec, idx) => {
          const id = Number(rec.values?.id) || (startIndex + idx + 1);
          if (!isNaN(id)) maxImportedId = Math.max(maxImportedId, id);
          const importedFileName = rec.values?.__fileName ? String(rec.values.__fileName) : '';
          if (rec.values) delete rec.values.__fileName;
          let sourceId = '';
          const normTitle = normalizeText(recordTitle(rec));
          if (normTitle) {
            const match = citations.find(c => passesTitleAbstract(c) && normalizeText(c.title).includes(normTitle));
            if (match) sourceId = match.id;
          }
          return {
            id,
            sourceId,
            fileName: importedFileName || 'Imported_Document.pdf',
            fileSize: 0,
            fileUrl: '',
            status: AnalysisStatus.COMPLETED,
            uploadTimestamp: Date.now(),
            reviewStatus: 'UNREVIEWED' as ReviewStatus,
            data: rec,
          };
        });

        setRecordsWithRef(prev => {
          const existingMap = new Map<number, PdfRecord>(prev.map(r => [r.id, r]));
          importedRecords.forEach(imp => { existingMap.set(imp.id, imp); });
          return Array.from(existingMap.values()).sort((a, b) => b.id - a.id);
        });
        setNextId(Math.max(nextId, maxImportedId + 1));
        alert(`Successfully imported ${importedRecords.length} extraction records. Please pick the matching PDF folder to enable viewing.`);
      }
    };
    reader.readAsText(file);
    if (csvImportInputRef.current) csvImportInputRef.current.value = "";
  };

  const handleFolderLink = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentProject || !event.target.files) return;
    const allFiles = Array.from(event.target.files);
    const pdfFiles = allFiles.filter((f: any) => f.name.toLowerCase().endsWith('.pdf')) as File[];

    if (pdfFiles.length === 0) {
      alert("No PDF files found in the selected folder.");
      return;
    }

    setIsProcessing(true);

    // --- helpers ---------------------------------------------------------
    const IMPORT_PLACEHOLDER = 'imported_document.pdf';
    const stripExt = (n: string) => (n.split(/[\\/]/).pop() || n).replace(/\.pdf$/i, '');
    const alnum = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const tokens = (s: string) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4);

    // similarity between a candidate string (title/filename) and a PDF's base name -> 0..1
    const similarity = (candidate: string, fileBase: string): number => {
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

    // Precompute each PDF's comparable base name.
    const pdfBases = pdfFiles.map(f => ({ file: f, base: stripExt(f.name), alnum: alnum(stripExt(f.name)) }));

    // Records still needing a file.
    const targets = records
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => !r.fileUrl);

    // Build all candidate (record, pdf, score) pairs above threshold.
    const THRESHOLD = 0.45;
    type Cand = { recIdx: number; pdfIdx: number; score: number };
    const candidates: Cand[] = [];

    targets.forEach(({ r, idx }) => {
      const realName = r.fileName && r.fileName.toLowerCase() !== IMPORT_PLACEHOLDER ? stripExt(r.fileName) : '';
      const title = recordTitle(r);
      const citationTitle = r.sourceId ? (citations.find(c => c.id === r.sourceId)?.title || '') : '';
      const sourceIdNorm = r.sourceId ? alnum(r.sourceId) : '';

      pdfBases.forEach((p, pdfIdx) => {
        let score = 0;
        // 1) exact / near-exact filename
        if (realName) score = Math.max(score, similarity(realName, p.base));
        // 2) DOI / PMID embedded in the filename (many downloaders name files this way)
        if (sourceIdNorm && sourceIdNorm.length >= 6 && p.alnum.includes(sourceIdNorm)) score = Math.max(score, 0.97);
        // 3) title-based matching (the case CSV-imported records rely on)
        if (title) score = Math.max(score, similarity(title, p.base));
        if (citationTitle) score = Math.max(score, similarity(citationTitle, p.base));

        if (score >= THRESHOLD) candidates.push({ recIdx: idx, pdfIdx, score });
      });
    });

    // Greedy best-first assignment: each PDF and each record used at most once.
    candidates.sort((a, b) => b.score - a.score);
    const usedPdf = new Set<number>();
    const usedRec = new Set<number>();
    const assignment = new Map<number, number>(); // recIdx -> pdfIdx
    for (const c of candidates) {
      if (usedPdf.has(c.pdfIdx) || usedRec.has(c.recIdx)) continue;
      usedPdf.add(c.pdfIdx);
      usedRec.add(c.recIdx);
      assignment.set(c.recIdx, c.pdfIdx);
    }

    const updatedRecords = [...records];
    let matchedCount = 0;
    for (const [recIdx, pdfIdx] of assignment) {
      const record = updatedRecords[recIdx];
      const matchedFile = pdfFiles[pdfIdx];
      await saveBlob(currentProject.id, record.id, matchedFile);
      updatedRecords[recIdx] = {
        ...record,
        fileName: matchedFile.name,
        fileSize: matchedFile.size,
        fileUrl: URL.createObjectURL(matchedFile),
        status: AnalysisStatus.COMPLETED,
      };
      matchedCount++;
    }

    setRecordsWithRef(updatedRecords);
    setIsProcessing(false);

    const needed = targets.length;
    const leftover = pdfFiles.length - matchedCount;
    if (matchedCount === 0) {
      alert(`Scanning complete. Linked 0 of ${needed} record(s).\n\nNo filenames or titles matched the ${pdfFiles.length} PDF(s) in the folder. The linker matches by exact filename, by DOI/PMID in the filename, and by title similarity — renaming PDFs closer to the paper title usually fixes remaining gaps.`);
    } else {
      alert(`Scanning complete. Linked ${matchedCount} of ${needed} record(s) to local PDFs.` + (leftover > 0 ? ` ${leftover} folder PDF(s) were unused.` : ''));
    }
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // ---- Full-text screening -------------------------------------------------
  const handleFullTextStatusChange = (id: string, status: ReviewStatus) => {
    setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, fullTextStatus: status } : c));
  };
  const handleFullTextReasonChange = (id: string, reason: string) => {
    setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, fullTextReason: reason } : c));
  };

  const attachFullTextBlob = async (citation: CitationRecord, blob: Blob, fileName: string) => {
    if (!currentProject) return;
    await saveBlob(currentProject.id, `ft_${citation.id}`, blob);
    const url = URL.createObjectURL(blob);
    setFullTextUrls(prev => ({ ...prev, [citation.id]: url }));
    // A new PDF invalidates any AI verdict made on the previous file.
    setCitationsWithRef(prev => prev.map(c => c.id === citation.id ? {
      ...c, fullTextFileName: fileName,
      fullTextAiStatus: undefined, fullTextAiReasoning: undefined, fullTextAiExclusionReason: undefined, fullTextAiError: undefined,
    } : c));
  };

  const handleAttachFullTextClick = (citation: CitationRecord) => {
    fullTextTargetRef.current = citation;
    fullTextInputRef.current?.click();
  };

  const handleFullTextFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const citation = fullTextTargetRef.current;
    if (file && citation) {
      await attachFullTextBlob(citation, file, file.name);
    }
    fullTextTargetRef.current = null;
    if (fullTextInputRef.current) fullTextInputRef.current.value = "";
  };

  // Try open access (Unpaywall) first, then Elsevier if both credentials are set.
  const fetchFullTextBlob = async (citation: CitationRecord): Promise<Blob | null> => {
    if (!citation.doi) return null;
    let pdfBlob: Blob | null = null;
    const oaUrl = await fetchOpenAccessPdfUrl(citation.doi);
    if (oaUrl) pdfBlob = await downloadPdfBlob(oaUrl);
    if (!pdfBlob && elsevierApiKey && elsevierInstToken && citation.doi.includes('10.1016')) {
      pdfBlob = await fetchElsevierPdfBlob(citation.doi, elsevierApiKey, elsevierInstToken);
    }
    return pdfBlob;
  };

  const handleAutoFetchFullText = async (citation: CitationRecord) => {
    if (!currentProject || !citation.doi) return;
    setIsFetchingFT(prev => ({ ...prev, [citation.id]: true }));
    try {
      const pdfBlob = await fetchFullTextBlob(citation);
      if (!pdfBlob) {
        alert(`Could not auto-fetch a full-text PDF for DOI: ${citation.doi}. Try attaching it manually.`);
        return;
      }
      await attachFullTextBlob(citation, pdfBlob, `${citation.id}_fulltext.pdf`);
    } catch (e) {
      console.error("Full-text fetch error:", e);
      alert("An error occurred while fetching the full text.");
    } finally {
      setIsFetchingFT(prev => ({ ...prev, [citation.id]: false }));
    }
  };

  // Papers in Stage 2 that still have no PDF.
  const ftMissingPdf = () => citationsRef.current.filter(c => passesTitleAbstract(c) && !c.fullTextFileName);

  const handleBulkFetchFullText = async () => {
    if (!currentProject) return;
    const targets = ftMissingPdf().filter(c => c.doi);
    if (targets.length === 0) {
      alert("No papers without a PDF have a DOI to fetch from. Use 'Link PDF Folder' or attach them manually.");
      return;
    }
    ftFetchStopRef.current = false;
    setIsFtFetchStopRequested(false);
    setIsFtBulkFetching(true);
    setFtFetchProgress({ done: 0, total: targets.length });
    let found = 0;
    const notFound: string[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        if (ftFetchStopRef.current) break;
        const c = targets[i];
        // skip if a PDF was attached meanwhile (e.g. folder link while running)
        if (citationsRef.current.find(x => x.id === c.id)?.fullTextFileName) { setFtFetchProgress({ done: i + 1, total: targets.length }); continue; }
        setIsFetchingFT(prev => ({ ...prev, [c.id]: true }));
        try {
          const blob = await fetchFullTextBlob(c);
          if (blob) { await attachFullTextBlob(c, blob, `${c.id}_fulltext.pdf`); found++; }
          else notFound.push(c.doi);
        } catch (e) {
          console.error("Full-text bulk fetch error:", c.doi, e);
          notFound.push(c.doi);
        } finally {
          setIsFetchingFT(prev => ({ ...prev, [c.id]: false }));
          setFtFetchProgress({ done: i + 1, total: targets.length });
        }
        if (i < targets.length - 1 && !ftFetchStopRef.current) await new Promise(r => setTimeout(r, 4000));
      }
    } finally {
      const stopped = ftFetchStopRef.current;
      setIsFtBulkFetching(false);
      setIsFtFetchStopRequested(false);
      setFtFetchProgress(null);
      ftFetchStopRef.current = false;
      const noDoi = ftMissingPdf().filter(c => !c.doi).length;
      alert(`${stopped ? 'Auto-fetch stopped. ' : 'Auto-fetch complete. '}Attached ${found} PDF(s).` +
        (notFound.length ? `\n${notFound.length} not available open access (use 'DOI List' to get them via your library, then 'Link PDF Folder').` : '') +
        (noDoi ? `\n${noDoi} paper(s) have no DOI and must be attached manually or via folder.` : ''));
    }
  };

  const requestStopFtFetch = () => { ftFetchStopRef.current = true; setIsFtFetchStopRequested(true); };

  // Link a folder (or a multi-file selection) of PDFs to Stage 2 papers that have none yet.
  const handleFullTextFolderLink = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    try {
      if (!currentProject || !input.files) return;
      const pdfFiles = (Array.from(input.files) as File[]).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length === 0) { alert("No PDF files found in the selection."); return; }
      const missing = ftMissingPdf();
      if (missing.length === 0) { alert("Every full-text paper already has a PDF attached."); return; }

      const matches = matchPdfsToTargets(pdfFiles, missing.map(c => ({
        key: c.id,
        ids: [c.doi, /^\d{6,}$/.test(c.id) ? c.id : ''].filter(Boolean) as string[],
        texts: [c.title],
      })));
      for (const c of missing) {
        const file = matches.get(c.id);
        if (file) await attachFullTextBlob(c, file, file.name);
      }
      const linked = matches.size;
      const leftover = pdfFiles.length - linked;
      alert(linked === 0
        ? `Linked 0 of ${missing.length} paper(s). No filenames matched a DOI, PMID or title. Renaming PDFs to the DOI or paper title usually fixes this.`
        : `Linked ${linked} of ${missing.length} paper(s) without a PDF.` +
          (missing.length - linked > 0 ? ` ${missing.length - linked} still need a PDF.` : '') +
          (leftover > 0 ? ` ${leftover} selected PDF(s) were unused.` : ''));
    } finally {
      input.value = "";
    }
  };

  const downloadFullTextDoiList = () => {
    const missing = ftMissingPdf();
    const lines = missing.map(c => c.doi || c.id).filter(Boolean);
    if (lines.length === 0) { alert("Every full-text paper already has a PDF attached."); return; }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${currentProject?.name || 'project'}_FullText_missing_DOIs.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleViewFullText = async (citation: CitationRecord) => {
    if (!currentProject) return;
    let url = fullTextUrls[citation.id];
    if (!url) {
      const blob = await getBlob(currentProject.id, `ft_${citation.id}`);
      if (!blob) { alert("Full-text PDF not found. Please re-attach it."); return; }
      url = URL.createObjectURL(blob);
      setFullTextUrls(prev => ({ ...prev, [citation.id]: url }));
    }
    setViewingFullText({ url, fileName: citation.fullTextFileName || `${citation.id}.pdf` });
  };

  // ---- AI full-text screening (second reviewer on the PDF) ----------------
  const needsFtAi = (c: CitationRecord) => !!c.fullTextFileName && !c.fullTextAiStatus && !c.isFullTextAiProcessing;

  const handleFullTextAiSingle = async (id: string, force = false): Promise<'SUCCESS' | 'ERROR' | 'OVERLOAD'> => {
    const project = currentProjectRef.current;
    const citation = citationsRef.current.find(c => c.id === id);
    if (!project || !citation || citation.isFullTextAiProcessing) return 'ERROR';
    if (citation.fullTextAiStatus && !force) return 'SUCCESS';

    const ftCriteria = fullTextCriteriaRef.current.trim();
    if (!ftCriteria) return 'ERROR';

    setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, isFullTextAiProcessing: true, fullTextAiError: undefined } : c));
    try {
      const blob = await getBlob(project.id, `ft_${id}`);
      if (!blob) throw new Error("Full-text PDF not found in storage. Please re-attach it.");
      const { verdict, reasoning, exclusionReason } = await screenFullText(blob, citation.title, ftCriteria, activeModelRef.current);
      setCitationsWithRef(prev => prev.map(c => c.id === id ? {
        ...c,
        fullTextAiStatus: verdict,
        fullTextAiReasoning: reasoning,
        fullTextAiExclusionReason: exclusionReason || undefined,
        fullTextAiError: undefined,
      } : c));
      return 'SUCCESS';
    } catch (error: any) {
      console.error("Full-text AI screening error:", error);
      const status = error?.status || error?.code;
      const msg = String(error?.message || error || 'Unknown error');
      const lower = msg.toLowerCase();
      setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, fullTextAiError: msg.slice(0, 300) } : c));
      return (status === 429 || status === 503 || status === 529 || lower.includes('overloaded') || lower.includes('rate limit')) ? 'OVERLOAD' : 'ERROR';
    } finally {
      setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, isFullTextAiProcessing: false } : c));
    }
  };

  const handleFullTextAiClick = (id: string, force = false) => {
    if (!fullTextCriteriaRef.current.trim()) {
      alert("Please enter the full-text eligibility criteria in the sidebar first.");
      return;
    }
    handleFullTextAiSingle(id, force);
  };

  const runBulkFullTextAi = async () => {
    if (!fullTextCriteriaRef.current.trim()) {
      alert("Please enter the full-text eligibility criteria in the sidebar first.");
      return;
    }
    const attempted = new Set<string>(); // each paper is tried at most once per run, so a failing PDF can't loop forever
    const eligible = () => citationsRef.current.filter(c =>
      passesTitleAbstract(c) && needsFtAi(c) && !attempted.has(c.id));
    if (eligible().length === 0) {
      const missingPdf = citationsRef.current.filter(c => passesTitleAbstract(c) && !c.fullTextFileName).length;
      alert(missingPdf > 0
        ? `Nothing to screen: every paper with a PDF already has an AI verdict. ${missingPdf} paper(s) still need a PDF attached.`
        : "Nothing to screen: every paper already has an AI verdict.");
      return;
    }

    ftStopRef.current = false;
    setIsFtStopRequested(false);
    setIsFtBulkRunning(true);
    let delayMs = 5000;
    let ok = 0, failed = 0;

    try {
      while (true) {
        const next = eligible()[0];
        if (!next) break;
        attempted.add(next.id);

        const result = await handleFullTextAiSingle(next.id);
        if (result === 'SUCCESS') ok++; else failed++;
        if (ftStopRef.current) break;

        if (result === 'OVERLOAD') delayMs = 45000;
        else if (result === 'SUCCESS') delayMs = Math.max(4000, delayMs - 500);

        if (eligible().length > 0 && !ftStopRef.current) {
          await new Promise(res => setTimeout(res, delayMs));
        }
      }
      const summary = `${ok} screened${failed ? `, ${failed} failed (see the cards for the error)` : ''}.`;
      alert(ftStopRef.current ? `Full-text AI stopped. ${summary}` : `Full-text AI screening complete. ${summary}`);
    } finally {
      setIsFtBulkRunning(false);
      setIsFtStopRequested(false);
      ftStopRef.current = false;
    }
  };

  const handleEnrichRecord = async (record: PdfRecord) => {
    if (!currentProject || !record.fileUrl || !record.data) return;
    
    setRecordsWithRef(prev => prev.map(r => r.id === record.id ? { ...r, status: AnalysisStatus.PROCESSING } : r));
    
    try {
      const blob = await getBlob(currentProject.id, record.id);
      if (!blob) throw new Error("PDF blob not found in storage");
      
      const enriched = await enrichPdfContent(blob, template, record.data ?? blankRecord(template), activeModel, { focus: targetChemicals });
      setRecordsWithRef(prev => prev.map(r => r.id === record.id ? { ...r, status: AnalysisStatus.COMPLETED, data: enriched } : r));
    } catch (e: any) {
      console.error("Enrichment failed", e);
      const msg = e?.message || e?.error?.message || 'Enrichment failed';
      setRecordsWithRef(prev => prev.map(r => r.id === record.id ? { ...r, status: AnalysisStatus.ERROR, errorMessage: msg } : r));
    }
  };

  const handleRetryExtraction = async (record: PdfRecord) => {
    if (!currentProject) return;
    
    setRecordsWithRef(prev => prev.map(r => r.id === record.id ? { ...r, status: AnalysisStatus.PROCESSING, errorMessage: undefined } : r));
    
    try {
      const blob = await getBlob(currentProject.id, record.id);
      if (!blob) {
        throw new Error("PDF file not found in local storage. Try re-uploading or linking the PDF folder.");
      }
      
      const result = await analyzePdfContent(blob, template, activeModel, { focus: targetChemicals });
      setRecordsWithRef(prev => prev.map(r => r.id === record.id ? { ...r, status: AnalysisStatus.COMPLETED, data: result } : r));
    } catch (error: any) {
      console.error("Retry extraction failed", error);
      const msg = error?.message || error?.error?.message || 'Analysis failed again';
      setRecordsWithRef(prev => prev.map(r => r.id === record.id ? { ...r, status: AnalysisStatus.ERROR, errorMessage: msg } : r));
    }
  };

  const handleBulkEnrich = async () => {
    const incomplete = records.filter(r => 
      r.status === AnalysisStatus.COMPLETED && 
      needsEnrichment(r) && 
      !!r.fileUrl
    );

    if (incomplete.length === 0) {
        alert("No incomplete records with available PDF files found. If you imported results via CSV, please link the PDF folder first.");
        return;
    }

    if (!confirm(`Run surgical AI enrichment on ${incomplete.length} records? This will process articles 1-by-1 with a strict 4-second interval.`)) return;

    setIsBulkEnriching(true);
    
    try {
      for (let i = 0; i < incomplete.length; i++) {
        const record = incomplete[i];
        await handleEnrichRecord(record);
        if (i < incomplete.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }
    } catch (err) {
      console.error("[Bulk Enrichment] Error in sequence:", err);
    } finally {
      setIsBulkEnriching(false);
      alert("Bulk enrichment complete.");
    }
  };

  const needsEnrichment = (r: PdfRecord) => recordNeedsEnrichment(template, r.data);

  const fullTextCitations = useMemo(
    () => citations.filter(passesTitleAbstract),
    [citations]
  );

  const isFtConflict = isFullTextConflict;

  const filteredFullText = useMemo(() => {
    if (!activeFilter || activeFilter === 'TOTAL') return fullTextCitations;
    if (activeFilter === 'INCLUDED') return fullTextCitations.filter(c => c.fullTextStatus === 'INCLUDED');
    if (activeFilter === 'EXCLUDED') return fullTextCitations.filter(c => c.fullTextStatus === 'EXCLUDED');
    if (activeFilter === 'CONFLICTS') return fullTextCitations.filter(isFtConflict);
    return fullTextCitations;
  }, [fullTextCitations, activeFilter]);

  const stats = useMemo(() => {
    if (stage === 'SCREENING') {
      const total = citations.length;
      const userReviewed = citations.filter(c => c.reviewStatus !== 'UNREVIEWED').length;
      const aiReviewed = citations.filter(c => !!c.aiReviewStatus).length;
      const conflicts = citations.filter(isTitleAbstractConflict).length;
      const included = citations.filter(c => c.reviewStatus === 'INCLUDED').length;
      const excluded = citations.filter(c => c.reviewStatus === 'EXCLUDED').length;
      return { total, userReviewed, aiReviewed, conflicts, included, excluded };
    } else if (stage === 'FULLTEXT') {
      const total = fullTextCitations.length;
      const userReviewed = fullTextCitations.filter(c => c.fullTextStatus && c.fullTextStatus !== 'UNREVIEWED').length;
      const included = fullTextCitations.filter(c => c.fullTextStatus === 'INCLUDED').length;
      const excluded = fullTextCitations.filter(c => c.fullTextStatus === 'EXCLUDED').length;
      const withPdf = fullTextCitations.filter(c => !!c.fullTextFileName).length;
      const aiReviewed = fullTextCitations.filter(c => !!c.fullTextAiStatus).length;
      const conflicts = fullTextCitations.filter(c => isFtConflict(c)).length;
      return { total, userReviewed, included, excluded, withPdf, aiReviewed, conflicts };
    } else {
      const total = records.length;
      const userReviewed = records.filter(r => r.reviewStatus !== 'UNREVIEWED').length;
      const processing = records.filter(r => r.status === AnalysisStatus.PROCESSING).length;
      const completed = records.filter(r => r.status === AnalysisStatus.COMPLETED).length;
      const errors = records.filter(r => r.status === AnalysisStatus.ERROR).length;
      const included = records.filter(r => r.reviewStatus === 'INCLUDED').length;
      const excluded = records.filter(r => r.reviewStatus === 'EXCLUDED').length;
      const incomplete = records.filter(r => r.status === AnalysisStatus.COMPLETED && needsEnrichment(r)).length;
      return { total, userReviewed, processing, completed, errors, included, excluded, incomplete };
    }
  }, [citations, records, stage]);

  const filteredCitations = useMemo(() => {
    if (!activeFilter || activeFilter === 'TOTAL') return citations;
    return citations.filter(c => {
      if (activeFilter === 'INCLUDED') return c.reviewStatus === 'INCLUDED';
      if (activeFilter === 'EXCLUDED') return c.reviewStatus === 'EXCLUDED';
      if (activeFilter === 'CONFLICTS') return isTitleAbstractConflict(c);
      return true;
    });
  }, [citations, activeFilter]);

  const filteredRecords = useMemo(() => {
    if (!activeFilter || activeFilter === 'TOTAL') return records;
    return records.filter(r => {
      if (activeFilter === 'INCLUDED') return r.reviewStatus === 'INCLUDED';
      if (activeFilter === 'EXCLUDED') return r.reviewStatus === 'EXCLUDED';
      if (activeFilter === 'ERRORS') return r.status === AnalysisStatus.ERROR;
      if (activeFilter === 'INCOMPLETE') return r.status === AnalysisStatus.COMPLETED && needsEnrichment(r);
      return true;
    });
  }, [records, activeFilter]);

  const pendingFromScreening = useMemo(() => {
    if (stage !== 'EXTRACTION') return [];
    const recordSourceIds = new Set(records.map(r => r.sourceId).filter(Boolean));
    return citations.filter(c => passesTitleAbstract(c) && c.fullTextStatus === 'INCLUDED' && !recordSourceIds.has(c.id));
  }, [citations, records, stage]);

  const handleAutoFetchPdf = async (citation: CitationRecord, targetId?: number, silent: boolean = false) => {
    if (!currentProject) return;

    setIsSyncing(prev => ({ ...prev, [citation.id]: true }));
    try {
      let pdfBlob: Blob | null = null;
      let usedMethod = "";

      // Prefer a full-text PDF already attached during full-text screening (no re-download).
      const existingFt = await getBlob(currentProject.id, `ft_${citation.id}`);
      if (existingFt) {
        pdfBlob = existingFt;
        usedMethod = "FullText";
      }

      if (!pdfBlob && !citation.doi) {
        if (!silent) alert("This citation has no attached full-text PDF and no DOI to fetch from.");
        setIsSyncing(prev => ({ ...prev, [citation.id]: false }));
        return;
      }

      if (!pdfBlob && citation.doi) {
        const oaUrl = await fetchOpenAccessPdfUrl(citation.doi);
        if (oaUrl) {
          pdfBlob = await downloadPdfBlob(oaUrl);
          if (pdfBlob) usedMethod = "Unpaywall";
        }
      }

      // Step 2: Fallback to Elsevier ONLY if BOTH credentials are present
      if (!pdfBlob && elsevierApiKey && elsevierInstToken && citation.doi.includes('10.1016')) {
        pdfBlob = await fetchElsevierPdfBlob(citation.doi, elsevierApiKey, elsevierInstToken);
        if (pdfBlob) usedMethod = "Elsevier Proxy";
      }

      if (!pdfBlob) {
        if (!silent) alert(`Could not find a PDF for DOI: ${citation.doi}. Open Access unavailable and Elsevier check failed (requires both Key + InstToken).`);
        setIsSyncing(prev => ({ ...prev, [citation.id]: false }));
        if (targetId) setRecordsWithRef(prev => prev.map(r => r.id === targetId ? { ...r, status: AnalysisStatus.ERROR, errorMessage: 'PDF source not found' } : r));
        return;
      }

      const id = targetId || nextId;
      if (!targetId) setNextId(prev => prev + 1);
      
      await saveBlob(currentProject.id, id, pdfBlob);

      const recordData: Partial<PdfRecord> = {
        id,
        sourceId: citation.id,
        fileName: `${citation.id}_${usedMethod}.pdf`,
        fileSize: pdfBlob.size,
        fileUrl: URL.createObjectURL(pdfBlob),
        status: AnalysisStatus.PROCESSING,
        uploadTimestamp: Date.now(),
        reviewStatus: 'UNREVIEWED'
      };

      if (targetId) {
          setRecordsWithRef(prev => prev.map(r => r.id === targetId ? { ...r, ...recordData } as PdfRecord : r));
      } else {
          setRecordsWithRef(prev => [recordData as PdfRecord, ...prev]);
      }
      
      try {
        const result = await analyzePdfContent(pdfBlob, template, activeModel, { focus: targetChemicals });
        setRecordsWithRef(prev => prev.map(r => r.id === id ? { ...r, status: AnalysisStatus.COMPLETED, data: result } : r));
      } catch (error: any) {
        const msg = error?.message || error?.error?.message || 'AI Analysis failed';
        setRecordsWithRef(prev => prev.map(r => r.id === id ? { ...r, status: AnalysisStatus.ERROR, errorMessage: msg } : r));
      }
    } catch (error) {
      console.error("Sync error:", error);
      if (!silent) alert("An unexpected error occurred during sync.");
      if (targetId) setRecordsWithRef(prev => prev.map(r => r.id === targetId ? { ...r, status: AnalysisStatus.ERROR, errorMessage: 'Unexpected error' } : r));
    } finally {
      setIsSyncing(prev => ({ ...prev, [citation.id]: false }));
    }
  };

  const handleBulkAutoFetch = async () => {
    const withDoi = pendingFromScreening.filter(c => c.doi);
    if (withDoi.length === 0) {
        alert("No pending articles with DOIs found for auto-fetching.");
        return;
    }
    
    setIsBulkSyncing(true);
    let currentStartId = nextId;
    setNextId(prev => prev + withDoi.length);

    const placeholders: PdfRecord[] = withDoi.map((c, i) => ({
        id: currentStartId + i,
        sourceId: c.id,
        fileName: `Searching...`,
        fileSize: 0,
        fileUrl: '',
        status: AnalysisStatus.PROCESSING,
        uploadTimestamp: Date.now(),
        reviewStatus: 'UNREVIEWED'
    }));

    setRecordsWithRef(prev => [...placeholders, ...prev]);

    for (let i = 0; i < withDoi.length; i++) {
        const citation = withDoi[i];
        await handleAutoFetchPdf(citation, currentStartId + i, true);
        if (i < withDoi.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }
    setIsBulkSyncing(false);
  };

  const downloadDoiList = () => {
    const identifiers = pendingFromScreening
      .map(c => c.doi || c.id)
      .filter(Boolean)
      .join('\n');
    
    if (!identifiers) {
      alert("No identifiers available to download.");
      return;
    }

    const blob = new Blob([identifiers], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProject?.name}_Pending_Article_Identifiers.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseMedline = (content: string): CitationRecord[] => {
    const results: CitationRecord[] = [];
    const entries = content.split(/\r?\n(?=PMID- )/).filter(e => e.trim());
    for (const entry of entries) {
      const lines = entry.split(/\r?\n/);
      const data: Record<string, string[]> = {};
      let lastTag = "";
      for (const line of lines) {
        const tagMatch = line.match(/^([A-Z]{2,4})\s*-\s?(.*)$/);
        if (tagMatch) {
          lastTag = tagMatch[1].trim();
          const value = tagMatch[2].trim();
          if (!data[lastTag]) data[lastTag] = [];
          data[lastTag].push(value);
        } else if (lastTag && line.trim()) {
          const currentValues = data[lastTag];
          if (currentValues && currentValues.length > 0) currentValues[currentValues.length - 1] += " " + line.trim();
        }
      }
      if (data["PMID"]) {
        results.push({
          id: data["PMID"][0].trim(),
          title: (data["TI"] || data["T1"] || ["No Title Found"])[0].trim(),
          abstract: (data["AB"] || [""])[0].trim(),
          doi: (data["AID"] || []).find(a => a.includes("[doi]"))?.replace("[doi]", "").trim() || (data["LID"] || []).find(l => l.includes("[doi]"))?.replace("[doi]", "").trim() || "",
          authors: (data["AU"] || data["FAU"] || []),
          journal: (data["JT"] || data["TA"] || ["Unknown Journal"])[0].trim(),
          year: (data["DP"] || [""])[0].split(' ')[0],
          reviewStatus: 'UNREVIEWED'
        });
      }
    }
    return results;
  };

  const parseRis = (content: string): CitationRecord[] => {
    const results: CitationRecord[] = [];
    const lines = content.split(/\r?\n/);
    let currentData: Record<string, string[]> = {};
    let lastTag = "";

    const processRecord = (data: Record<string, string[]>) => {
      if (Object.keys(data).length === 0) return;

      const title = (data["TI"] || data["T1"] || data["CT"] || ["No Title Found"]).join(" ").trim();
      const abstract = (data["AB"] || data["N2"] || [""]).join(" ").trim();
      const doiRaw = (data["DO"] || data["DI"] || data["L3"] || [""])[0].trim();
      let doi = doiRaw;
      const doiPattern = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
      const match = doiRaw.match(doiPattern);
      if (match) doi = match[0];
      else doi = doiRaw.replace(/^doi:\s*/i, "").split(/\s+/)[0]; 
      
      const pmidMatch = data["AN"]?.find(val => val.includes("PMID:"))?.replace("PMID:", "").trim();
      const id = pmidMatch || data["ID"]?.[0] || data["AN"]?.[0] || generateId();
      
      results.push({
        id,
        title,
        abstract,
        doi,
        authors: (data["AU"] || data["A1"] || []),
        journal: (data["JF"] || data["JO"] || data["T2"] || ["Unknown Journal"])[0].trim(),
        year: (data["PY"] || data["Y1"] || [""])[0].substring(0, 4),
        reviewStatus: 'UNREVIEWED'
      });
    };

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const tagMatch = trimmed.match(/^([A-Z0-9]{2})\s*-?\s*(.*)$/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const value = tagMatch[2].trim();
        if (tag === "ER") {
          processRecord(currentData);
          currentData = {};
          lastTag = "";
        } else {
          lastTag = tag;
          if (!currentData[lastTag]) currentData[lastTag] = [];
          currentData[lastTag].push(value);
        }
      } else if (lastTag && trimmed) {
        if (currentData[lastTag] && currentData[lastTag].length > 0) {
          currentData[lastTag][currentData[lastTag].length - 1] += " " + trimmed;
        }
      }
    }
    if (Object.keys(currentData).length > 0) processRecord(currentData);
    return results;
  };

  const handleAiScreenSingle = async (id: string): Promise<'SUCCESS' | 'ERROR' | 'OVERLOAD'> => {
    const citation = citationsRef.current.find(c => c.id === id);
    if (!citation) return 'ERROR';
    if (citation.isAiProcessing || citation.aiReviewStatus) return 'SUCCESS';

    setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, isAiProcessing: true } : c));

    try {
      const { verdict, reasoning } = await screenCitation(citation.title, citation.abstract, criteriaRef.current, activeModelRef.current);
      setCitationsWithRef(prev => prev.map(c => c.id === id ? {
        ...c,
        aiReviewStatus: verdict,
        aiReasoning: reasoning,
        isAiProcessing: false
      } : c));
      return 'SUCCESS';
    } catch (error: any) {
      const status = error?.status || error?.code;
      const errorMsg = (error?.message || '').toLowerCase();
      const isOverload = status === 429 || status === 503 || errorMsg.includes('overloaded') || errorMsg.includes('rate limit');
      return isOverload ? 'OVERLOAD' : 'ERROR';
    } finally {
      setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, isAiProcessing: false } : c));
    }
  };

  const runBulkAi = async () => {
    const count = citationsRef.current.filter(c => !c.aiReviewStatus && !c.isAiProcessing).length;
    if (count === 0) {
      alert("No unreviewed citations found for AI screening.");
      return;
    }

    bulkStopRef.current = false;
    setIsBulkStopRequested(false);
    setIsAiBulkRunning(true);
    let delayMs = 5000;

    try {
      while (true) {
        const next = citationsRef.current.find(c => !c.aiReviewStatus && !c.isAiProcessing);
        if (!next) break;

        const result = await handleAiScreenSingle(next.id);
        if (bulkStopRef.current) break;

        if (result === "OVERLOAD") delayMs = 45000;
        else if (result === "SUCCESS") delayMs = Math.max(4000, delayMs - 500);

        const hasMore = citationsRef.current.some(c => !c.aiReviewStatus && !c.isAiProcessing);
        if (hasMore && !bulkStopRef.current) {
          await new Promise(res => setTimeout(res, delayMs));
        }
      }
      if (bulkStopRef.current) alert("Bulk AI stopped.");
      else alert("Bulk AI screening complete.");
    } finally {
      setIsAiBulkRunning(false);
      setIsBulkStopRequested(false);
      bulkStopRef.current = false;
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentProject || !event.target.files) return;
    const files = Array.from(event.target.files).filter((f: any) => f.type === 'application/pdf') as File[];
    if (files.length === 0) return;
    
    setIsProcessing(true);
    const startIndex = nextId;
    
    const newRecords: PdfRecord[] = files.map((file, index) => {
      const id = startIndex + index;
      saveBlob(currentProject.id, id, file);
      const record: PdfRecord = { 
        id, 
        fileName: file.name, 
        fileSize: file.size, 
        fileUrl: URL.createObjectURL(file), 
        status: AnalysisStatus.PENDING, 
        uploadTimestamp: Date.now(), 
        reviewStatus: 'UNREVIEWED' 
      };
      if (index === 0 && uploadTargetCitation) record.sourceId = uploadTargetCitation.id;
      return record;
    });

    setNextId(prev => prev + newRecords.length);
    setRecordsWithRef(prev => [...newRecords, ...prev]);
    setUploadTargetCitation(null);

    for (let i = 0; i < files.length; i++) {
        const recordToProcess = newRecords[i];
        setRecordsWithRef(prev => prev.map(r => r.id === recordToProcess.id ? { ...r, status: AnalysisStatus.PROCESSING } : r));
        
        try {
          const result = await analyzePdfContent(files[i], template, activeModel, { focus: targetChemicals });
          setRecordsWithRef(prev => prev.map(r => {
            if (r.id !== recordToProcess.id) return r;
            let matchedSourceId = r.sourceId;
            if (!matchedSourceId) {
                const extractedTitle = normalizeText(recordTitle(result));
                const currentRecordSourceIds = new Set(prev.map(rec => rec.sourceId).filter(Boolean));
                const potentialCitations = citationsRef.current.filter(c => 
                    passesTitleAbstract(c) && !currentRecordSourceIds.has(c.id)
                );
                const match = potentialCitations.find(c => {
                    const citTitle = normalizeText(c.title);
                    return extractedTitle.includes(citTitle) || citTitle.includes(extractedTitle);
                });
                if (match) matchedSourceId = match.id;
            }
            return { ...r, status: AnalysisStatus.COMPLETED, data: result, sourceId: matchedSourceId };
          }));
        } catch (error: any) {
          const msg = error?.message || error?.error?.message || 'Analysis failed';
          setRecordsWithRef(prev => prev.map(r => r.id === recordToProcess.id ? { ...r, status: AnalysisStatus.ERROR, errorMessage: msg } : r));
        }
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCitationFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      let parsed: CitationRecord[] = [];
      try {
        if (fileName.endsWith('.ris')) parsed = parseRis(content);
        else parsed = parseMedline(content);
      } catch (err) {
        alert("Failed to parse file.");
        return;
      }
      if (parsed.length === 0) {
        alert("No citations found.");
        return;
      }
      setCitationsWithRef(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const existingDois = new Set(prev.map(c => (c.doi || "").toLowerCase().trim()).filter(Boolean));
        const existingNormalizedKeys = new Set(prev.map(c => `${normalizeText(c.title)}_${c.year || ""}`));
        const uniqueToImport = parsed.filter(item => {
          const isIdDup = existingIds.has(item.id);
          const isDoiDup = item.doi && existingDois.has(item.doi.toLowerCase().trim());
          const normalizedKey = `${normalizeText(item.title)}_${item.year || ""}`;
          const isTitleDup = existingNormalizedKeys.has(normalizedKey);
          return !(isIdDup || isDoiDup || isTitleDup);
        });
        if (uniqueToImport.length > 0) return [...uniqueToImport, ...prev];
        return prev;
      });
    };
    reader.readAsText(file);
    if (pubmedInputRef.current) pubmedInputRef.current.value = '';
  };

  if (!isHydrated) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-bold ${modal.variant === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>
                {modal.title}
              </h3>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              {modal.type === 'CREATE' ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Project Name</label>
                    <input
                      ref={modalInputRef}
                      type="text"
                      value={modalInputValue}
                      onChange={(e) => setModalInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && modalInputValue.trim()) modal.onConfirm(modalInputValue);
                        if (e.key === 'Escape') setModal(null);
                      }}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                      placeholder="Enter name..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Discipline / Extraction Template</label>
                    <select
                      value={modalTemplateId}
                      onChange={(e) => setModalTemplate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                    >
                      {listTemplates().map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] text-slate-400 leading-snug">{getTemplate(modalTemplateId).description}</p>
                  </div>
                </div>
              ) : modal.type === 'INPUT' ? (
                <>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Project Name</label>
                  <input 
                    ref={modalInputRef}
                    type="text"
                    value={modalInputValue}
                    onChange={(e) => setModalInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && modalInputValue.trim()) modal.onConfirm(modalInputValue);
                      if (e.key === 'Escape') setModal(null);
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                    placeholder="Enter name..."
                  />
                </>
              ) : modal.type === 'SETTINGS' ? (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       <Shield className="w-4 h-4 text-blue-600" />
                       <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Elsevier API Key</label>
                    </div>
                    <input 
                      type="password"
                      value={modalInputValue}
                      onChange={(e) => setModalInputValue(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                      placeholder="Enter ScienceDirect API Key..."
                    />
                    <p className="mt-2 text-[10px] text-slate-400 leading-tight">
                      Mandatory. This key is required for full-text PDF retrieval via proxy.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       <Key className="w-4 h-4 text-blue-600" />
                       <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Institutional Token (Insttoken)</label>
                    </div>
                    <input 
                      type="password"
                      value={modalInstValue}
                      onChange={(e) => setModalInstValue(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                      placeholder="Enter Institutional Token..."
                    />
                    <p className="mt-2 text-[10px] text-slate-400 leading-tight font-bold">
                      Mandatory. This token must be provided together with your API key.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-600 font-medium leading-relaxed">
                  {modal.message}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setModal(null)}
                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => modal.onConfirm(modalInputValue)}
                className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] ${
                  modal.variant === 'danger' 
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-100' 
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                }`}
              >
                {modal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingRecord && (
          <PdfViewer url={viewingRecord.fileUrl} fileName={viewingRecord.fileName} data={viewingRecord.data} template={template} onClose={() => setViewingRecord(null)} />
      )}
      {viewingFullText && (
          <PdfViewer url={viewingFullText.url} fileName={viewingFullText.fileName} template={template} onClose={() => setViewingFullText(null)} />
      )}

      {stage === 'PROJECTS' ? (
        <div className="min-h-screen">
          <header className="bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                  BioReview Pro
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={openSettingsModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                  <Settings className="w-5 h-5" />
                </button>
                <button onClick={openCreateModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-md hover:bg-blue-700 transition-all active:scale-95">
                  <Plus className="w-4 h-4" /> New Project
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800">Your Research Projects</h2>
              <p className="text-slate-500">Manage multiple systematic reviews and data extraction sessions.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <button onClick={openCreateModal} className="h-48 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all group">
                <div className="p-3 bg-slate-100 rounded-full group-hover:bg-blue-100 group-hover:scale-110 transition-all">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-bold">Create New Project</span>
              </button>

              {projects.map(project => (
                <div key={project.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all group relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                      <FolderOpen className="w-6 h-6" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openRenameModal(project)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDeleteModal(project.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 truncate mb-1">{project.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 font-medium mb-6">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(project.lastModified).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span>{project.citationCount} Citations</span>
                    <span>•</span>
                    <span>{project.pdfCount} PDFs</span>
                  </div>
                  <button onClick={() => loadProject(project)} className="w-full py-2.5 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-600 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                    Open Project <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </main>
        </div>
      ) : (
        <div className="min-h-screen pb-20">
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-4 overflow-hidden">
                  <button onClick={() => setStage('PROJECTS')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="w-px h-6 bg-slate-200"></div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Project</span>
                    <h1 className="text-base font-bold text-slate-800 truncate max-w-[150px] sm:max-w-xs">{currentProject?.name}</h1>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <div className="hidden md:flex items-center gap-1.5 mr-1 pl-2 pr-1 py-1 bg-slate-50 border border-slate-200 rounded-lg" title="AI model used for screening and extraction">
                      <BrainCircuit className="w-4 h-4 text-slate-400 shrink-0" />
                      <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-slate-600 outline-none cursor-pointer max-w-[160px]"
                      >
                        {AI_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}{hasApiKeyFor(m.providerId) ? '' : ' (no key)'}
                          </option>
                        ))}
                      </select>
                   </div>
                   <button onClick={openSettingsModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all mr-2">
                      <Settings className="w-5 h-5" />
                   </button>
                   <button onClick={() => csvImportInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-lg shadow-sm transition-all">
                      <Upload className="w-4 h-4" />
                      <span className="hidden sm:inline">Import Results</span>
                   </button>
                   <button onClick={exportToCsv} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-lg shadow-sm transition-all">
                      <FileDown className="w-4 h-4" />
                      <span className="hidden sm:inline">Export CSV</span>
                   </button>
                   {stage !== 'FULLTEXT' && (
                   <button onClick={() => { setUploadTargetCitation(null); stage === 'SCREENING' ? pubmedInputRef.current?.click() : fileInputRef.current?.click(); }} disabled={isProcessing} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-md transition-all active:scale-95">
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">{stage === 'SCREENING' ? 'Add Citations' : 'Add PDFs'}</span>
                   </button>
                   )}
                </div>
              </div>
            </div>
            <div className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <nav className="flex space-x-8 h-12">
                  <button onClick={() => setStage('SCREENING')} className={`flex items-center gap-2 px-1 text-sm font-semibold border-b-2 transition-all ${stage === 'SCREENING' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                    <Search className="w-4 h-4" /> Stage 1: Screening
                    {citations.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md text-[10px]">{citations.length}</span>}
                  </button>
                  <button onClick={() => setStage('FULLTEXT')} className={`flex items-center gap-2 px-1 text-sm font-semibold border-b-2 transition-all ${stage === 'FULLTEXT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                    <FileText className="w-4 h-4" /> Stage 2: Full Text
                    {fullTextCitations.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md text-[10px]">{fullTextCitations.length}</span>}
                  </button>
                  <button onClick={() => setStage('EXTRACTION')} className={`flex items-center gap-2 px-1 text-sm font-semibold border-b-2 transition-all ${stage === 'EXTRACTION' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                    <Microscope className="w-4 h-4" /> Stage 3: Extraction
                    {records.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md text-[10px]">{records.length}</span>}
                  </button>
                </nav>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <input type="file" ref={pubmedInputRef} onChange={handleCitationFileUpload} className="hidden" accept=".txt,.nbib,.ris" />
            <input type="file" ref={csvImportInputRef} onChange={handleCsvImport} className="hidden" accept=".csv" />
            <input type="file" ref={fileInputRef} onChange={handlePdfUpload} className="hidden" accept="application/pdf" multiple />
            <input type="file" ref={folderInputRef} onChange={handleFolderLink} className="hidden" {...({ webkitdirectory: "", directory: "" } as any)} />
            <input type="file" ref={ftFolderInputRef} onChange={handleFullTextFolderLink} className="hidden" {...({ webkitdirectory: "", directory: "" } as any)} />
            <input type="file" ref={ftFilesInputRef} onChange={handleFullTextFolderLink} className="hidden" accept="application/pdf" multiple />
            <input type="file" ref={fullTextInputRef} onChange={handleFullTextFileSelected} className="hidden" accept="application/pdf" />

            {(stage === 'SCREENING' ? citations.length : stage === 'FULLTEXT' ? fullTextCitations.length : records.length) > 0 || (stage === 'EXTRACTION' && pendingFromScreening.length > 0) ? (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm sticky top-32 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 font-bold text-slate-800 mb-4">
                            <BarChart3 className="w-5 h-5 text-blue-600" /> Project Progress
                        </div>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                    <span>USER REVIEW</span>
                                    <span>{Math.round((stats.userReviewed / (stats.total || 1)) * 100)}%</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(stats.userReviewed / (stats.total || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                    <span>{stage === 'SCREENING' ? 'AI SCREENING' : stage === 'FULLTEXT' ? 'PDFs ATTACHED' : 'EXTRACTION'}</span>
                                    <span>{Math.round((((stage === 'SCREENING' ? stats.aiReviewed : stage === 'FULLTEXT' ? stats.withPdf : stats.completed) || 0) / (stats.total || 1)) * 100)}%</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(((stage === 'SCREENING' ? stats.aiReviewed : stage === 'FULLTEXT' ? stats.withPdf : stats.completed) || 0) / (stats.total || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            {stage === 'FULLTEXT' && (
                            <div>
                                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                    <span>AI FULL-TEXT SCREEN</span>
                                    <span>{stats.aiReviewed || 0} / {stats.withPdf || 0} PDFs</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${((stats.aiReviewed || 0) / (stats.withPdf || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button onClick={() => setActiveFilter(null)} className={`p-3 rounded-xl border transition-all text-left ${activeFilter === null ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight">Total</span>
                            <span className="text-xl font-black text-slate-800">{stats.total}</span>
                        </button>
                        <button onClick={() => setActiveFilter(activeFilter === 'INCLUDED' ? null : 'INCLUDED')} className={`p-3 rounded-xl border transition-all text-left ${activeFilter === 'INCLUDED' ? 'bg-green-50 border-green-500 ring-2 ring-green-100 shadow-sm' : 'bg-green-50/30 border-green-100 hover:border-green-200'}`}>
                            <span className="block text-[10px] font-bold text-green-600 uppercase tracking-tight">Included</span>
                            <span className="text-xl font-black text-green-700">{stats.included}</span>
                        </button>
                        <button onClick={() => setActiveFilter(activeFilter === 'EXCLUDED' ? null : 'EXCLUDED')} className={`p-3 rounded-xl border transition-all text-left ${activeFilter === 'EXCLUDED' ? 'bg-red-50 border-red-500 ring-2 ring-red-100 shadow-sm' : 'bg-red-50/30 border-red-100 hover:border-red-200'}`}>
                            <span className="block text-[10px] font-bold text-red-600 uppercase tracking-tight">Excluded</span>
                            <span className="text-xl font-black text-green-700">{stats.excluded}</span>
                        </button>
                        {(stage === 'SCREENING' || stage === 'FULLTEXT') ? (
                            <button onClick={() => setActiveFilter(activeFilter === 'CONFLICTS' ? null : 'CONFLICTS')} className={`p-3 rounded-xl border transition-all text-left ${activeFilter === 'CONFLICTS' ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-100 shadow-sm' : (stats.conflicts > 0 ? 'bg-orange-50/30 border-orange-100 hover:border-orange-200' : 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed')}`} disabled={stats.conflicts === 0}>
                                <span className={`block text-[10px] font-bold uppercase tracking-tight ${stats.conflicts > 0 ? 'text-orange-600' : 'text-slate-400'}`}>Conflicts</span>
                                <span className={`text-xl font-black ${stats.conflicts > 0 ? 'text-orange-700' : 'text-slate-800'}`}>{stats.conflicts}</span>
                            </button>
                        ) : (
                            <button onClick={() => setActiveFilter(activeFilter === 'INCOMPLETE' ? null : 'INCOMPLETE')} className={`p-3 rounded-xl border transition-all text-left ${activeFilter === 'INCOMPLETE' ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-100 shadow-sm' : (stats.incomplete > 0 ? 'bg-amber-50/30 border-amber-100 hover:border-amber-200' : 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed')}`} disabled={stats.incomplete === 0}>
                                <span className={`block text-[10px] font-bold uppercase tracking-tight ${stats.incomplete > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Incomplete</span>
                                <span className={`text-xl font-black ${stats.incomplete > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{stats.incomplete}</span>
                            </button>
                        )}
                    </div>

                    {stage === 'SCREENING' && (
                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 font-bold text-slate-800 mb-4">
                            <BrainCircuit className="w-5 h-5 text-blue-600" /> AI Configuration
                        </div>
                        <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} className="w-full h-28 text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none mb-4" placeholder="Enter inclusion/exclusion criteria..." />
                        <div className="flex gap-3">
                          <button onClick={runBulkAi} disabled={isAiBulkRunning} className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                            {isAiBulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Run Bulk AI
                          </button>
                          <button onClick={requestStopBulkAi} disabled={!isAiBulkRunning || isBulkStopRequested} className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl shadow-sm font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                            Stop
                          </button>
                        </div>
                        {isAiBulkRunning && isBulkStopRequested && (
                          <div className="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Stop requested — will stop after current paper.
                          </div>
                        )}
                      </div>
                    )}

                    {stage === 'FULLTEXT' && (
                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <ListChecks className="w-5 h-5 text-blue-600" /> Full-Text Eligibility Criteria
                          </div>
                          <button
                            onClick={() => {
                              if (fullTextCriteria.trim() && !window.confirm("Replace the current full-text criteria with the Stage 1 criteria?")) return;
                              setFullTextCriteria(criteria);
                            }}
                            className="text-[11px] font-semibold text-blue-600 hover:underline shrink-0"
                            title="Start from the title/abstract criteria, then tighten them"
                          >
                            Copy from Stage 1
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          Usually stricter than title/abstract: study design, exposure/dose, outcomes, data availability, language, etc. Saved with the project.
                        </p>
                        <textarea
                          value={fullTextCriteria}
                          onChange={(e) => setFullTextCriteria(e.target.value)}
                          className="w-full h-40 text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
                          placeholder={"e.g.\nINCLUDE: in vivo or in vitro primary data; dose/concentration reported; quantitative endpoint.\nEXCLUDE: no extractable data; conference abstract only; duplicate dataset."}
                        />
                        <div className="flex gap-3 mt-3">
                          <button onClick={runBulkFullTextAi} disabled={isFtBulkRunning || !fullTextCriteria.trim()} title={!fullTextCriteria.trim() ? 'Enter criteria first' : 'AI-screen every attached PDF that has no AI verdict yet'} className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                            {isFtBulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} AI Screen Full Texts
                          </button>
                          <button onClick={requestStopFtBulk} disabled={!isFtBulkRunning || isFtStopRequested} className="px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl shadow-sm font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                            Stop
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">
                          Sends each attached PDF + these criteria to {activeModel.label}. Papers without a PDF are skipped. The AI is a second reviewer — your thumbs decide.
                        </p>
                        {isFtBulkRunning && isFtStopRequested && (
                          <div className="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Stop requested — will stop after current paper.
                          </div>
                        )}
                      </div>
                    )}

                    {stage === 'EXTRACTION' && (
                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2 font-bold text-slate-800 mb-4">
                            <BrainCircuit className="w-5 h-5 text-blue-600" /> Extraction Focus
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Focus Terms (optional)</p>
                        <textarea 
                          value={targetChemicals} 
                          onChange={(e) => setTargetChemicals(e.target.value)} 
                          className="w-full h-24 text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none mb-2" 
                          placeholder={template.focusHint ? template.focusHint : 'Optional terms to focus the extraction...'} 
                        />
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Narrow the AI extraction to specific terms. Leave empty to extract everything the {template.name} template defines.
                        </p>
                      </div>
                    )}
                    
                    <div className="pt-4 border-t border-slate-100">
                        <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Shield className={`w-4 h-4 ${ (elsevierApiKey && elsevierInstToken) ? 'text-green-500' : 'text-slate-400'}`} />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Elsevier API</span>
                                </div>
                                <button onClick={openSettingsModal} className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${ (elsevierApiKey && elsevierInstToken) ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                                    { (elsevierApiKey && elsevierInstToken) ? 'ACTIVE' : 'SETUP'}
                                </button>
                            </div>
                            { (elsevierApiKey && elsevierInstToken) && (
                                <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 text-blue-700 rounded text-[9px] font-black uppercase tracking-tighter">
                                   <Key className="w-3 h-3" /> Fully Configured
                                </div>
                            )}
                        </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-3 space-y-6">
                    {activeFilter && (
                        <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 px-4 py-3 rounded-xl">
                            <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
                                <Search className="w-4 h-4" /> Showing only: <span className="font-bold underline uppercase tracking-wider">{activeFilter}</span>
                            </div>
                            <button onClick={() => setActiveFilter(null)} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-100/50 px-2 py-1 rounded-lg transition-colors">
                                <FilterX className="w-3.5 h-3.5" /> Clear Filter
                            </button>
                        </div>
                    )}

                    {stage === 'EXTRACTION' && (
                        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden mb-8">
                            <div className="bg-blue-50/50 px-6 py-4 border-b border-blue-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <Link2 className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">Local Resource Management</h3>
                                        <p className="text-xs text-slate-500 font-medium">Link your PDF folder to enable viewing for imported results</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => folderInputRef.current?.click()} className="px-3 py-2 bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95">
                                        <FolderPlus className="w-3.5 h-3.5" /> Link PDF Folder
                                    </button>
                                    {stats.incomplete > 0 && (
                                      <button disabled={isBulkEnriching} onClick={handleBulkEnrich} className="px-3 py-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50">
                                          {isBulkEnriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Enrich Data ({stats.incomplete})
                                      </button>
                                    )}
                                    {pendingFromScreening.length > 0 && (
                                      <>
                                        <button onClick={downloadDoiList} className="px-3 py-2 bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95">
                                            <List className="w-3.5 h-3.5" /> DOI List
                                        </button>
                                        <button disabled={isBulkSyncing} onClick={handleBulkAutoFetch} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50">
                                            {isBulkSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Auto-fetch PDFs
                                        </button>
                                      </>
                                    )}
                                </div>
                            </div>
                            
                            {pendingFromScreening.length > 0 && !activeFilter && (
                              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                  <div className="bg-slate-50 px-6 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                      Awaiting Extraction ({pendingFromScreening.length})
                                  </div>
                                  {pendingFromScreening.map(citation => (
                                      <div key={citation.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                          <div className="flex-1 min-w-0 pr-4">
                                              <h4 className="text-sm font-bold text-slate-800 truncate">{citation.title}</h4>
                                              <div className="flex items-center gap-2 mt-1">
                                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">ID: {citation.id}</span>
                                                  {citation.doi && <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-[150px]">DOI: {citation.doi}</span>}
                                                  {citation.doi?.includes('10.1016') && (
                                                    <span className="text-[9px] font-black text-white bg-amber-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                      <Database className="w-2 h-2" /> ELSEVIER
                                                    </span>
                                                  )}
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                              {citation.doi && (
                                                  <a href={`https://doi.org/${citation.doi}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all shadow-sm">
                                                      <ExternalLink className="w-4 h-4" />
                                                  </a>
                                              )}
                                              {citation.doi ? (
                                                  <button disabled={isSyncing[citation.id]} onClick={() => handleAutoFetchPdf(citation)} className="p-2 bg-white border border-slate-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded-lg transition-all shadow-sm disabled:opacity-50" title={(elsevierApiKey && elsevierInstToken) ? "Auto-fetch (OA + Elsevier)" : "Auto-fetch (OA only, Elsevier credentials required)"}>
                                                      {isSyncing[citation.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                  </button>
                                              ) : (
                                                  <div className="p-2 text-slate-300 bg-slate-50 border border-slate-100 rounded-lg">
                                                      <FileQuestion className="w-4 h-4" />
                                                  </div>
                                              )}
                                              <button onClick={() => { setUploadTargetCitation(citation); fileInputRef.current?.click(); }} className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all shadow-sm">
                                                  <Upload className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                            )}
                        </div>
                    )}

                    {stage === 'SCREENING' ? (
                        <div className="grid grid-cols-1 gap-6">
                            {filteredCitations.length > 0 ? (
                                filteredCitations.map(citation => (
                                    <CitationCard key={citation.id} citation={citation} onReviewStatusChange={(id, status) => setCitationsWithRef(prev => prev.map(c => c.id === id ? { ...c, reviewStatus: status } : c))} onAiScreen={(id) => { void handleAiScreenSingle(id); }} />
                                ))
                            ) : (
                                <div className="py-20 flex flex-col items-center text-slate-400">
                                    <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
                                    <p className="font-medium italic">No citations found.</p>
                                    <button onClick={() => setActiveFilter(null)} className="mt-4 text-blue-600 font-bold text-sm hover:underline">Clear all filters</button>
                                </div>
                            )}
                        </div>
                    ) : stage === 'FULLTEXT' ? (
                        <div className="grid grid-cols-1 gap-6">
                            {fullTextCitations.length > 0 && (
                              <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="bg-blue-50/50 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                      <Link2 className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-slate-800">Full-Text PDFs</h3>
                                      <p className="text-xs text-slate-500 font-medium">
                                        {stats.withPdf ?? 0} of {fullTextCitations.length} attached
                                        {ftFetchProgress && <> · fetching {ftFetchProgress.done}/{ftFetchProgress.total}</>}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button onClick={() => ftFolderInputRef.current?.click()} className="px-3 py-2 bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95" title="Pick a folder; PDFs are matched to papers by DOI/PMID in the filename or by title">
                                      <FolderPlus className="w-3.5 h-3.5" /> Link PDF Folder
                                    </button>
                                    <button onClick={() => ftFilesInputRef.current?.click()} className="px-3 py-2 bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95" title="Pick several PDFs; they are matched to papers automatically">
                                      <Upload className="w-3.5 h-3.5" /> Select PDFs
                                    </button>
                                    <button onClick={downloadFullTextDoiList} className="px-3 py-2 bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95" title="DOIs of papers still missing a PDF">
                                      <List className="w-3.5 h-3.5" /> DOI List
                                    </button>
                                    {isFtBulkFetching ? (
                                      <button onClick={requestStopFtFetch} disabled={isFtFetchStopRequested} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {isFtFetchStopRequested ? 'Stopping…' : 'Stop fetching'}
                                      </button>
                                    ) : (
                                      <button onClick={handleBulkFetchFullText} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95" title="Unpaywall (open access), then Elsevier if configured">
                                        <Sparkles className="w-3.5 h-3.5" /> Auto-fetch PDFs
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {fullTextCitations.length > 0 ? (
                                filteredFullText.map(citation => (
                                    <FullTextCard
                                        key={citation.id}
                                        citation={citation}
                                        hasPdf={!!citation.fullTextFileName}
                                        isFetching={!!isFetchingFT[citation.id]}
                                        onStatusChange={handleFullTextStatusChange}
                                        onReasonChange={handleFullTextReasonChange}
                                        onAttach={handleAttachFullTextClick}
                                        onAutoFetch={handleAutoFetchFullText}
                                        onView={handleViewFullText}
                                        onAiScreen={handleFullTextAiClick}
                                        isConflict={isFtConflict(citation)}
                                    />
                                ))
                            ) : (
                                <div className="py-20 flex flex-col items-center text-slate-400">
                                    <FileText className="w-12 h-12 mb-4 opacity-20" />
                                    <p className="font-medium italic">Nothing to full-text screen yet.</p>
                                    <p className="text-xs mt-1">Include citations in Stage 1 (title/abstract) and they will appear here for full-text review.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {filteredRecords.length > 0 ? (
                                filteredRecords.map(record => (
                                    <PdfCard 
                                        key={record.id} 
                                        record={record} 
                                        template={template}
                                        onReviewStatusChange={(id, status) => setRecordsWithRef(prev => prev.map(r => r.id === id ? { ...r, reviewStatus: status } : r))} 
                                        onView={setViewingRecord} 
                                        onEnrich={handleEnrichRecord}
                                        onRetry={handleRetryExtraction}
                                    />
                                ))
                            ) : (
                                <div className="col-span-2 py-20 flex flex-col items-center text-slate-400">
                                    <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
                                    <p className="font-medium italic">No papers found.</p>
                                    <button onClick={() => setActiveFilter(null)} className="mt-4 text-blue-600 font-bold text-sm hover:underline">Clear all filters</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
              </div>
            ) : (
                <EmptyState stage={stage} onUploadClick={() => { setUploadTargetCitation(null); stage === 'SCREENING' ? pubmedInputRef.current?.click() : fileInputRef.current?.click(); }} onImportResultsClick={() => csvImportInputRef.current?.click()} />
            )}
          </main>
        </div>
      )}
    </div>
  );
};

export default App;