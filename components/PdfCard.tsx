import React, { useState } from 'react';
import { PdfRecord, AnalysisStatus, ReviewStatus } from '../types';
import type { DisciplineTemplate, FieldDef } from '../templateTypes';
import { studyFieldsOf, groupsOf, recordNeedsEnrichment } from '../lib/buildFromTemplate';
import {
  Loader2, AlertCircle, Eye, ShieldCheck, FileSearch, RefreshCw,
  ThumbsUp, ThumbsDown, HelpCircle, Info, Sparkles, Quote, X, Table2,
} from 'lucide-react';

interface PdfCardProps {
  record: PdfRecord;
  template: DisciplineTemplate;
  onReviewStatusChange: (id: number, status: ReviewStatus) => void;
  onView: (record: PdfRecord) => void;
  onEnrich?: (record: PdfRecord) => void;
  onRetry?: (record: PdfRecord) => void;
}

const isEmpty = (v: any): boolean => {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const s = String(v).trim().toLowerCase();
  return s === '' || s === 'n/a' || s === 'not applicable' || s === 'not measured';
};

const directionClass = (v: string): string => {
  const s = v.toLowerCase();
  if (s.includes('increase')) return 'text-rose-600';
  if (s.includes('decrease')) return 'text-blue-600';
  if (s.includes('no change')) return 'text-slate-500';
  return 'text-slate-700';
};

const formatValue = (v: any): string => {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

export const PdfCard: React.FC<PdfCardProps> = ({ record, template, onReviewStatusChange, onView, onEnrich, onRetry }) => {
  const { id, fileName, status, data, errorMessage, reviewStatus, fileUrl } = record;
  const [showEvidenceFor, setShowEvidenceFor] = useState<string | null>(null);

  if (status === AnalysisStatus.PROCESSING) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center justify-center min-h-[350px] transition-all">
        <div className="relative mb-4">
          <div className="absolute inset-0 bg-blue-100 animate-ping rounded-full opacity-20"></div>
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin relative z-10" />
        </div>
        <p className="text-slate-800 font-bold text-center">AI at Work...</p>
        <p className="text-[10px] text-slate-400 mt-2 font-mono text-center">ID: {id} • Extraction in progress</p>
      </div>
    );
  }

  if (status === AnalysisStatus.ERROR) {
    return (
      <div className="bg-red-50 rounded-2xl border border-red-100 p-8 flex flex-col min-h-[350px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 text-red-700">
            <AlertCircle className="w-6 h-6" />
            <span className="font-bold text-lg">Extraction Failed</span>
          </div>
          {onRetry && (
            <button onClick={() => onRetry(record)} className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-red-700 transition-all flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Re-run
            </button>
          )}
        </div>
        <p className="text-red-800 mb-4 font-medium line-clamp-2">{fileName}</p>
        <div className="mt-auto bg-white/50 p-4 rounded-xl border border-red-200">
          <p className="text-xs text-red-600 font-medium">ERROR: {errorMessage || 'Download error or model timeout.'}</p>
        </div>
      </div>
    );
  }

  const values = data?.values ?? {};
  const evidence = data?.evidence ?? {};
  const allFields = studyFieldsOf(template);
  const groups = groupsOf(template);

  // Choose a headline: a field whose id looks like a title, else the first field, else the filename.
  const titleField = allFields.find((f) => /title/i.test(f.id)) || allFields[0];
  const headline = titleField && !isEmpty(values[titleField.id]) ? formatValue(values[titleField.id]) : fileName;

  const summaryFields = allFields.filter((f) => f.emphasis === 'summary' && f.id !== titleField?.id && !isEmpty(values[f.id]));
  const badgeFields = allFields.filter((f) => f.emphasis === 'badge' && !isEmpty(values[f.id]) && !(f.type === 'boolean' && values[f.id] === false));
  const shownAbove = new Set<string>([titleField?.id, ...summaryFields.map((f) => f.id), ...badgeFields.map((f) => f.id)].filter(Boolean) as string[]);

  const isIncomplete = recordNeedsEnrichment(template, data);

  const getBorderColor = () => {
    if (!fileUrl) return 'border-amber-200 bg-amber-50/10';
    if (isIncomplete) return 'border-amber-400 ring-1 ring-amber-100';
    switch (reviewStatus) {
      case 'INCLUDED': return 'border-green-400 ring-2 ring-green-100';
      case 'EXCLUDED': return 'border-red-400 ring-2 ring-red-100';
      case 'NOT_SURE': return 'border-amber-400 ring-2 ring-amber-100';
      default: return 'border-slate-200';
    }
  };

  const EvidenceBtn = ({ field }: { field: string }) =>
    evidence[field] ? (
      <button
        onClick={(e) => { e.stopPropagation(); setShowEvidenceFor(showEvidenceFor === field ? null : field); }}
        className={`p-1 rounded-md transition-all ${showEvidenceFor === field ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
        title="View source evidence"
      >
        <Quote className="w-3 h-3" />
      </button>
    ) : null;

  const renderFieldValue = (f: FieldDef) => {
    const v = values[f.id];
    if (isEmpty(v)) return <span className="text-[11px] text-slate-300 italic">—</span>;
    if (f.type === 'string' && /increase|decrease|no change/i.test(String(v))) {
      return <span className={`text-[11px] font-bold ${directionClass(String(v))}`}>{formatValue(v)}</span>;
    }
    if (f.type === 'string[]') {
      return (
        <div className="flex flex-wrap gap-1">
          {(v as any[]).slice(0, 4).map((c, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-slate-50 text-slate-600 text-[9px] font-semibold rounded border border-slate-200">{String(c)}</span>
          ))}
          {(v as any[]).length > 4 && <span className="text-[9px] text-slate-400">+{(v as any[]).length - 4}</span>}
        </div>
      );
    }
    return <span className="text-[11px] font-semibold text-slate-700">{formatValue(v)}</span>;
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all relative overflow-hidden flex flex-col group ${getBorderColor()}`}>
      {/* Evidence overlay */}
      {showEvidenceFor && evidence[showEvidenceFor] && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm p-6 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Quote className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Source Evidence</span>
            </div>
            <button onClick={() => setShowEvidenceFor(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs text-slate-700 leading-relaxed italic font-serif">"{evidence[showEvidenceFor]}"</p>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 text-center font-medium">Snippet extracted directly from the PDF for verification.</p>
        </div>
      )}

      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${fileUrl ? 'bg-blue-50 group-hover:bg-blue-600 cursor-pointer' : 'bg-slate-100 text-slate-400'}`}
            onClick={() => fileUrl && onView(record)}
          >
            <FileSearch className={`w-5 h-5 ${fileUrl ? 'text-blue-600 group-hover:text-white' : ''}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-slate-900 leading-tight line-clamp-2 group-hover:text-blue-700 transition-colors text-sm" title={headline}>{headline}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">#{id} • {fileName}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary box */}
        {summaryFields.map((f) => (
          <div key={f.id} className="bg-blue-50/40 p-3 rounded-xl border border-blue-100/50">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{f.label}</span>
              </div>
              <EvidenceBtn field={f.id} />
            </div>
            <p className="text-xs text-slate-700 leading-relaxed italic line-clamp-3">"{formatValue(values[f.id])}"</p>
          </div>
        ))}

        {/* Incomplete / awaiting file */}
        {!fileUrl ? (
          <div className="bg-amber-100/50 p-2 rounded-lg border border-amber-200 flex items-center gap-2 text-amber-700 text-[10px] font-bold">
            <Info className="w-3.5 h-3.5" /> AWAITING LOCAL PDF FILE (LINK FOLDER)
          </div>
        ) : isIncomplete && (
          <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 text-[10px] font-bold">
              <Sparkles className="w-3.5 h-3.5" /> INCOMPLETE DATA
            </div>
            {onEnrich && (
              <button onClick={(e) => { e.stopPropagation(); onEnrich(record); }} className="text-[9px] font-black text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded shadow-sm">ENRICH</button>
            )}
          </div>
        )}

        {/* Badges */}
        {badgeFields.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badgeFields.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                <Info className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-600 uppercase">{f.type === 'boolean' ? f.label : formatValue(values[f.id])}</span>
                <EvidenceBtn field={f.id} />
              </div>
            ))}
          </div>
        )}

        {/* Sections */}
        {template.sections.map((section) => {
          const fields = section.fields.filter((f) => !shownAbove.has(f.id) && !isEmpty(values[f.id]));
          if (fields.length === 0) return null;
          return (
            <div key={section.id} className="border-t border-slate-100 pt-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{section.title}</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {fields.map((f) => (
                  <div key={f.id} className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate">{f.label}</span>
                      <EvidenceBtn field={f.id} />
                    </div>
                    <div className="mt-0.5">{renderFieldValue(f)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Repeating groups */}
        {groups.map((g) => {
          const rows = data?.groups?.[g.id] ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={g.id} className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Table2 className="w-3 h-3" /> {g.title}
                </span>
                <EvidenceBtn field={g.id} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>{g.fields.map((f) => <th key={f.id} className="px-2 py-1 text-[8px] font-bold text-slate-400 uppercase tracking-tight">{f.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 6).map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {g.fields.map((f) => <td key={f.id} className="px-2 py-1 text-[10px] text-slate-700 font-medium whitespace-nowrap">{isEmpty(row[f.id]) ? '—' : formatValue(row[f.id])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 6 && <p className="text-[9px] text-slate-400 mt-1">+{rows.length - 6} more rows (see full export)</p>}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="mt-auto p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
        <div className="flex gap-1.5">
          <button onClick={() => onReviewStatusChange(id, 'INCLUDED')} className={`p-1.5 rounded-lg transition-all ${reviewStatus === 'INCLUDED' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-slate-400 hover:text-green-600 border border-slate-200'}`}>
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onReviewStatusChange(id, 'EXCLUDED')} className={`p-1.5 rounded-lg transition-all ${reviewStatus === 'EXCLUDED' ? 'bg-red-600 text-white shadow-md' : 'bg-white text-slate-400 hover:text-red-600 border border-slate-200'}`}>
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onReviewStatusChange(id, 'NOT_SURE')} className={`p-1.5 rounded-lg transition-all ${reviewStatus === 'NOT_SURE' ? 'bg-amber-600 text-white shadow-md' : 'bg-white text-slate-400 hover:text-amber-600 border border-slate-200'}`}>
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          {onEnrich && fileUrl && isIncomplete && (
            <button onClick={() => onEnrich(record)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 transition-all shadow-sm" title="Enrich data (fill missing fields)">
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          {onRetry && fileUrl && (
            <button onClick={() => onRetry(record)} className="p-1.5 rounded-lg bg-white text-slate-400 hover:text-blue-600 border border-slate-200 transition-all shadow-sm" title="Re-extract (re-run AI extraction on this PDF)">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={() => fileUrl && onView(record)} disabled={!fileUrl} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-sm ${fileUrl ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
          <Eye className="w-3 h-3" /> OPEN PDF
        </button>
      </div>
    </div>
  );
};
