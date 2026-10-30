
import React, { useState } from 'react';
import { CitationRecord, ReviewStatus } from '../types';
import { ThumbsUp, ThumbsDown, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { isTitleAbstractConflict } from '../lib/screeningRules';

interface CitationCardProps {
  citation: CitationRecord;
  onReviewStatusChange: (id: string, status: ReviewStatus) => void;
  onAiScreen: (id: string) => void;
}

export const CitationCard: React.FC<CitationCardProps> = ({ citation, onReviewStatusChange, onAiScreen }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { id, title, abstract, doi, authors, journal, year, reviewStatus, aiReviewStatus, aiReasoning, isAiProcessing } = citation;

  const isConflict = isTitleAbstractConflict(citation);

  const getBorderColor = () => {
    if (isConflict) return 'border-orange-400 ring-2 ring-orange-100 ring-offset-1';
    switch (reviewStatus) {
      case 'INCLUDED': return 'border-green-300 ring-1 ring-green-100';
      case 'EXCLUDED': return 'border-red-300 ring-1 ring-red-100';
      case 'NOT_SURE': return 'border-amber-300 ring-1 ring-amber-100';
      default: return 'border-slate-200';
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 flex flex-col transition-all group relative overflow-hidden ${getBorderColor()}`}>
      {isConflict && (
        <div className="absolute top-0 right-0 bg-orange-400 text-white px-3 py-1 text-[10px] font-bold rounded-bl-lg flex items-center gap-1 shadow-sm z-10">
          <AlertTriangle className="w-3 h-3" /> {reviewStatus === 'NOT_SURE' && !(aiReviewStatus && aiReviewStatus !== 'NOT_SURE') ? 'UNSURE — RESOLVE' : 'CONFLICT'}
        </div>
      )}

      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            <span>ID: {id}</span>
            {year && <span>• {year}</span>}
          </div>
          <h3 className="text-lg font-bold text-slate-800 leading-snug">
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-1 italic">
            {authors.slice(0, 3).join(', ')}{authors.length > 3 ? ' et al.' : ''} — <span className="font-semibold">{journal}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button 
            onClick={() => onReviewStatusChange(id, 'INCLUDED')}
            className={`p-2 rounded-lg transition-all ${reviewStatus === 'INCLUDED' ? 'bg-green-100 text-green-700 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-green-50'}`}
            title="User: Include"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onReviewStatusChange(id, 'EXCLUDED')}
            className={`p-2 rounded-lg transition-all ${reviewStatus === 'EXCLUDED' ? 'bg-red-100 text-red-700 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-red-50'}`}
            title="User: Exclude"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onReviewStatusChange(id, 'NOT_SURE')}
            className={`p-2 rounded-lg transition-all ${reviewStatus === 'NOT_SURE' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-amber-50'}`}
            title="User: Not Sure"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <p className={`text-sm text-slate-600 leading-relaxed ${!isExpanded ? 'line-clamp-3' : ''}`}>
          {abstract || "No abstract available for this record."}
        </p>
        {abstract && abstract.length > 200 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 text-xs font-semibold mt-2 flex items-center gap-1 hover:underline"
          >
            {isExpanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> Read Full Abstract</>}
          </button>
        )}
      </div>

      {/* AI Reviewer Section */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              AI REVIEWER (2ND)
            </div>
            {isAiProcessing ? (
              <div className="flex items-center gap-2 text-[10px] text-blue-500 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
              </div>
            ) : aiReviewStatus ? (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                aiReviewStatus === 'INCLUDED' ? 'bg-green-100 text-green-700' :
                aiReviewStatus === 'EXCLUDED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {aiReviewStatus}
              </span>
            ) : (
              <button 
                onClick={() => onAiScreen(id)}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition-colors"
              >
                RUN AI SCREENING
              </button>
            )}
          </div>
          {aiReasoning && (
            <p className="text-xs text-slate-500 leading-tight italic">
              "{aiReasoning}"
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-3">
          {doi && (
            <a 
              href={`https://doi.org/${doi}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> DOI
            </a>
          )}
        </div>
        
        {reviewStatus !== 'UNREVIEWED' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase">YOUR VOTE</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
              reviewStatus === 'INCLUDED' ? 'bg-green-600 text-white' :
              reviewStatus === 'EXCLUDED' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
            }`}>
              {reviewStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
