import React, { useState } from 'react';
import { CitationRecord, ReviewStatus } from '../types';
import { ThumbsUp, ThumbsDown, HelpCircle, ChevronDown, ChevronUp, ExternalLink, FileText, Download, Eye, Loader2, Paperclip, Sparkles, AlertTriangle, RotateCcw } from 'lucide-react';

interface FullTextCardProps {
  citation: CitationRecord;
  hasPdf: boolean;
  isFetching: boolean;
  onStatusChange: (id: string, status: ReviewStatus) => void;
  onReasonChange: (id: string, reason: string) => void;
  onAttach: (citation: CitationRecord) => void;
  onAutoFetch: (citation: CitationRecord) => void;
  onView: (citation: CitationRecord) => void;
  onAiScreen: (id: string, force?: boolean) => void;
  isConflict?: boolean;
}

export const FullTextCard: React.FC<FullTextCardProps> = ({
  citation, hasPdf, isFetching, onStatusChange, onReasonChange, onAttach, onAutoFetch, onView, onAiScreen, isConflict,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { id, title, abstract, doi, authors, journal, year, fullTextStatus, fullTextReason, fullTextFileName,
    fullTextAiStatus, fullTextAiReasoning, fullTextAiExclusionReason, fullTextAiError, isFullTextAiProcessing } = citation;
  const status = fullTextStatus || 'UNREVIEWED';

  const getBorderColor = () => {
    if (isConflict) return 'border-orange-400 ring-2 ring-orange-100';
    switch (status) {
      case 'INCLUDED': return 'border-green-300 ring-1 ring-green-100';
      case 'EXCLUDED': return 'border-red-300 ring-1 ring-red-100';
      case 'NOT_SURE': return 'border-amber-300 ring-1 ring-amber-100';
      default: return 'border-slate-200';
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 flex flex-col transition-all group relative overflow-hidden ${getBorderColor()}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            <span>ID: {id}</span>
            {year && <span>• {year}</span>}
            {citation.reviewStatus === 'NOT_SURE'
              ? <span className="text-amber-600">• Unsure at T/A</span>
              : <span className="text-green-600">• Passed T/A</span>}
          </div>
          <h3 className="text-lg font-bold text-slate-800 leading-snug">{title}</h3>
          <p className="text-xs text-slate-500 mt-1 italic">
            {authors.slice(0, 3).join(', ')}{authors.length > 3 ? ' et al.' : ''} — <span className="font-semibold">{journal}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => onStatusChange(id, 'INCLUDED')} className={`p-2 rounded-lg transition-all ${status === 'INCLUDED' ? 'bg-green-100 text-green-700 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-green-50'}`} title="Include (full text eligible)">
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button onClick={() => onStatusChange(id, 'EXCLUDED')} className={`p-2 rounded-lg transition-all ${status === 'EXCLUDED' ? 'bg-red-100 text-red-700 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-red-50'}`} title="Exclude (full text)">
            <ThumbsDown className="w-4 h-4" />
          </button>
          <button onClick={() => onStatusChange(id, 'NOT_SURE')} className={`p-2 rounded-lg transition-all ${status === 'NOT_SURE' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-amber-50'}`} title="Not sure">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <p className={`text-sm text-slate-600 leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}>
          {abstract || 'No abstract available for this record.'}
        </p>
        {abstract && abstract.length > 200 && (
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-blue-600 text-xs font-semibold mt-2 flex items-center gap-1 hover:underline">
            {isExpanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> Read Abstract</>}
          </button>
        )}
      </div>

      {/* Full-text PDF panel */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="bg-slate-50/60 rounded-xl p-3 border border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className={`w-4 h-4 shrink-0 ${hasPdf ? 'text-blue-600' : 'text-slate-300'}`} />
            <span className="text-xs font-medium text-slate-600 truncate">
              {hasPdf ? (fullTextFileName || 'Full text attached') : 'No full-text PDF yet'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasPdf && (
              <button onClick={() => onView(citation)} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all">
                <Eye className="w-3.5 h-3.5" /> Read
              </button>
            )}
            <button onClick={() => onAttach(citation)} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold rounded-lg shadow-sm transition-all" title="Upload a full-text PDF">
              <Paperclip className="w-3.5 h-3.5" /> {hasPdf ? 'Replace' : 'Attach'}
            </button>
            {doi && (
              <button onClick={() => onAutoFetch(citation)} disabled={isFetching} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 text-[11px] font-bold rounded-lg shadow-sm transition-all disabled:opacity-50" title="Auto-fetch by DOI (open access)">
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Fetch
              </button>
            )}
          </div>
        </div>

        {/* Reason (mainly for exclusions, per PRISMA) */}
        <input
          type="text"
          value={fullTextReason || ''}
          onChange={(e) => onReasonChange(id, e.target.value)}
          placeholder={status === 'EXCLUDED' ? 'Reason for exclusion (recommended)…' : 'Note / reason (optional)…'}
          className="w-full mt-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />

        {/* AI second reviewer on the full text */}
        <div className="mt-3 bg-slate-50/50 rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" /> AI REVIEWER (FULL TEXT)
              {isConflict && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" /> {citation.reviewStatus === 'NOT_SURE' && fullTextStatus !== 'INCLUDED' && fullTextStatus !== 'EXCLUDED' ? 'UNSURE AT T/A' : 'CONFLICT'}
                </span>
              )}
            </div>
            {isFullTextAiProcessing ? (
              <div className="flex items-center gap-2 text-[10px] text-blue-500 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" /> Reading PDF...
              </div>
            ) : fullTextAiStatus ? (
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  fullTextAiStatus === 'INCLUDED' ? 'bg-green-100 text-green-700' :
                  fullTextAiStatus === 'EXCLUDED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {fullTextAiStatus}
                </span>
                {hasPdf && (
                  <button onClick={() => onAiScreen(id, true)} className="p-1 text-slate-400 hover:text-blue-600 rounded" title="Re-run AI on this PDF (e.g. after changing the criteria)">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : hasPdf ? (
              <button onClick={() => onAiScreen(id)} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition-colors">
                RUN AI ON PDF
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 italic">Attach a PDF to enable</span>
            )}
          </div>
          {fullTextAiReasoning && (
            <p className="text-xs text-slate-500 leading-snug italic mt-2">"{fullTextAiReasoning}"</p>
          )}
          {fullTextAiExclusionReason && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-red-600 font-semibold truncate">Suggested reason: {fullTextAiExclusionReason}</span>
              {fullTextAiExclusionReason !== fullTextReason && (
                <button onClick={() => onReasonChange(id, fullTextAiExclusionReason)} className="shrink-0 text-blue-600 font-semibold hover:underline">
                  Use as reason
                </button>
              )}
            </div>
          )}
          {fullTextAiError && !isFullTextAiProcessing && (
            <p className="text-[11px] text-red-600 mt-2 break-words">AI error: {fullTextAiError}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {doi ? (
          <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors">
            <ExternalLink className="w-3 h-3" /> DOI
          </a>
        ) : <span />}
        {status !== 'UNREVIEWED' && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
            status === 'INCLUDED' ? 'bg-green-600 text-white' :
            status === 'EXCLUDED' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
          }`}>
            {status === 'INCLUDED' ? 'Eligible' : status}
          </span>
        )}
      </div>
    </div>
  );
};
