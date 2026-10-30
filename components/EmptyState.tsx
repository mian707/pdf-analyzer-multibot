import React from 'react';
import { FileUp, Search, Microscope, FileJson, FileText } from 'lucide-react';
import { AppStage } from '../types';

interface EmptyStateProps {
  stage: AppStage;
  onUploadClick: () => void;
  onImportResultsClick?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ stage, onUploadClick, onImportResultsClick }) => {
  const isScreening = stage === 'SCREENING';
  const isFullText = stage === 'FULLTEXT';

  const icon = isScreening ? <Search className="w-8 h-8 text-blue-600" />
    : isFullText ? <FileText className="w-8 h-8 text-blue-600" />
    : <Microscope className="w-8 h-8 text-blue-600" />;

  const heading = isScreening ? 'Import Citations (PubMed or RIS)'
    : isFullText ? 'Nothing to full-text screen yet'
    : 'Upload Study PDFs';

  const body = isScreening
    ? 'Upload a PubMed (.nbib, .txt) or RIS (.ris) file to begin Stage 1 screening, or import a previously exported results CSV.'
    : isFullText
    ? 'Include citations in Stage 1 (title/abstract screening). Everything you include there appears here for full-text eligibility review.'
    : 'Upload scientific papers to automatically extract specific parameters like chemicals, systems, and endpoints.';

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 hover:bg-slate-100/50 transition-colors">
      <div className="bg-blue-100 p-4 rounded-full mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">{heading}</h3>
      <p className="text-slate-500 text-center max-w-md mb-6">{body}</p>

      {!isFullText && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onUploadClick}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <FileUp className="w-4 h-4" />
            {isScreening ? 'Select Citation File' : 'Select PDF Files'}
          </button>

          {isScreening && onImportResultsClick && (
            <button
              onClick={onImportResultsClick}
              className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <FileJson className="w-4 h-4" />
              Import Results CSV
            </button>
          )}
        </div>
      )}
    </div>
  );
};
