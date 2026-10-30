import React, { useState } from 'react';
import { X, Download, ExternalLink, ShieldCheck, Microscope, Info, ChevronRight, ChevronLeft, Zap, Table2 } from 'lucide-react';
import type { AnalyzedRecord } from '../types';
import type { DisciplineTemplate, FieldDef } from '../templateTypes';
import { studyFieldsOf, groupsOf } from '../lib/buildFromTemplate';

interface PdfViewerProps {
  url: string;
  fileName: string;
  data?: AnalyzedRecord;
  template: DisciplineTemplate;
  onClose: () => void;
}

const isEmpty = (v: any): boolean => {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const s = String(v).trim().toLowerCase();
  return s === '' || s === 'n/a' || s === 'not applicable' || s === 'not measured';
};

const formatValue = (v: any): string => {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

const directionClass = (v: string): string => {
  const s = v.toLowerCase();
  if (s.includes('increase')) return 'text-rose-600';
  if (s.includes('decrease')) return 'text-blue-600';
  if (s.includes('no change')) return 'text-slate-500';
  return 'text-slate-800';
};

export const PdfViewer: React.FC<PdfViewerProps> = ({ url, fileName, data, template, onClose }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSearchTerm, setActiveSearchTerm] = useState<string>('');

  const pdfUrlWithSearch = activeSearchTerm
    ? `${url}#search=%22${encodeURIComponent(activeSearchTerm)}%22`
    : url;

  const jumpToSnippet = (field: string) => {
    const snippet = data?.evidence?.[field];
    if (!snippet) return;
    const cleanSnippet = snippet.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    let searchTerm = cleanSnippet;
    if (searchTerm.length > 80) {
      const lastSpace = cleanSnippet.lastIndexOf(' ', 80);
      searchTerm = lastSpace > 30 ? cleanSnippet.substring(0, lastSpace) : cleanSnippet.substring(0, 80);
    }
    setActiveSearchTerm('');
    setTimeout(() => setActiveSearchTerm(searchTerm), 10);
  };

  const values = data?.values ?? {};
  const evidence = data?.evidence ?? {};
  const allFields = studyFieldsOf(template);
  const titleField = allFields.find((f) => /title/i.test(f.id)) || allFields[0];
  const headline = titleField && !isEmpty(values[titleField.id]) ? formatValue(values[titleField.id]) : fileName;

  const VerifyBtn = ({ field }: { field: string }) =>
    evidence[field] ? (
      <button onClick={() => jumpToSnippet(field)} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Show evidence in PDF">
        <Zap className="w-3 h-3" />
      </button>
    ) : null;

  const renderValue = (f: FieldDef) => {
    const v = values[f.id];
    if (isEmpty(v)) return <span className="text-xs text-slate-300 italic">Not detected</span>;
    if (f.type === 'string' && /increase|decrease|no change/i.test(String(v))) {
      return <span className={`text-sm font-bold ${directionClass(String(v))}`}>{formatValue(v)}</span>;
    }
    if (f.type === 'string[]') {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(v as any[]).map((c, i) => (
            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-semibold rounded border border-slate-200">{String(c)}</span>
          ))}
        </div>
      );
    }
    return <span className="text-sm font-semibold text-slate-800">{formatValue(v)}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-white z-10 shadow-sm">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0">
              <Microscope className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 truncate text-lg" title={headline}>{headline}</h3>
              <p className="text-xs text-slate-400 font-medium truncate">{fileName} • {template.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 shrink-0 ml-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all border ${isSidebarOpen ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {isSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              {isSidebarOpen ? 'Hide Extraction' : 'Show Extraction'}
            </button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <a href={url} download={fileName} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Download Original">
              <Download className="w-5 h-5" />
            </a>
            <a href={url} target="_blank" rel="noreferrer" className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Open in New Tab">
              <ExternalLink className="w-5 h-5" />
            </a>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Close Viewer">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden bg-slate-100">
          <div className="flex-1 relative transition-all duration-300 ease-in-out">
            <iframe key={activeSearchTerm} src={pdfUrlWithSearch} className="w-full h-full absolute inset-0 border-0" title={`PDF Viewer - ${fileName}`} />
          </div>

          <aside className={`bg-white border-l border-slate-200 transition-all duration-300 ease-in-out flex flex-col shadow-xl z-10 ${isSidebarOpen ? 'w-[400px]' : 'w-0'}`}>
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h4 className="font-black text-slate-800 text-sm uppercase tracking-widest">AI Extraction Result</h4>
              </div>

              {!data ? (
                <div className="py-20 text-center">
                  <Info className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">No extraction data available for this file.</p>
                </div>
              ) : (
                <div className="space-y-7">
                  {template.sections.map((section) => {
                    const fields = section.fields.filter((f) => !isEmpty(values[f.id]));
                    if (fields.length === 0) return null;
                    return (
                      <section key={section.id}>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">{section.title}</label>
                        <div className="space-y-3">
                          {fields.map((f) => (
                            <div key={f.id} className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{f.label}</span>
                                  <VerifyBtn field={f.id} />
                                </div>
                                <div className="mt-1">{renderValue(f)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}

                  {groupsOf(template).map((g) => {
                    const rows = data.groups?.[g.id] ?? [];
                    if (rows.length === 0) return null;
                    return (
                      <section key={g.id}>
                        <div className="flex items-center justify-between mb-3">
                          <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Table2 className="w-3.5 h-3.5" /> {g.title}
                          </label>
                          <VerifyBtn field={g.id} />
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50">
                              <tr>{g.fields.map((f) => <th key={f.id} className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase">{f.label}</th>)}</tr>
                            </thead>
                            <tbody>
                              {rows.map((row, i) => (
                                <tr key={i} className="border-t border-slate-100">
                                  {g.fields.map((f) => <td key={f.id} className="px-2 py-1.5 text-[11px] text-slate-700 font-medium whitespace-nowrap">{isEmpty(row[f.id]) ? '—' : formatValue(row[f.id])}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
