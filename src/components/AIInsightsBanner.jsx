import React, { useState } from 'react';
import { BrainCircuit, Loader2, AlertTriangle, Lightbulb, TrendingUp, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

const AIInsightsBanner = ({ insights, loading, error, onClose, compact }) => {
  const [expanded, setExpanded] = useState(true);
  if (loading) return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-lg px-4 py-3 flex items-center gap-3">
      <Loader2 size={16} className="text-indigo-600 animate-spin" />
      <span className="text-xs font-semibold text-indigo-700">AI analyzing data...</span>
    </div>
  );
  if (error) return (
    <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
      <AlertTriangle size={14} className="text-rose-500" />
      <span className="text-xs font-semibold text-rose-700">AI analysis unavailable</span>
    </div>
  );
  if (!insights) return null;

  return (
    <div className={`bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 border border-indigo-100 rounded-lg ${compact ? 'py-1.5 px-3' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
            <Sparkles size={12} className="text-indigo-600" />
          </div>
          <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">AI Intelligence</span>
        </div>
        <div className="flex items-center gap-1">
          {onClose && <button onClick={onClose} className="p-0.5 rounded hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600"><X size={12} /></button>}
          <button onClick={() => setExpanded(v => !v)} className="p-0.5 rounded hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className={`space-y-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {insights.summary && <p className="text-slate-700 leading-relaxed font-medium">{insights.summary}</p>}
          {insights.trends?.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp size={10} /> Trends</p>
              <div className="flex flex-wrap gap-1">
                {insights.trends.map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-white/70 rounded-full border border-indigo-100 text-[10px] font-semibold text-slate-700">{t}</span>
                ))}
              </div>
            </div>
          )}
          {insights.recommendations?.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5 flex items-center gap-1"><Lightbulb size={10} /> Recommendations</p>
              {insights.recommendations.map((r, i) => (
                <p key={i} className="text-[10px] text-emerald-800 ml-3 leading-relaxed">• {r}</p>
              ))}
            </div>
          )}
          {insights.anomalies?.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wider mb-0.5 flex items-center gap-1"><AlertTriangle size={10} /> Flags</p>
              {insights.anomalies.map((a, i) => (
                <p key={i} className="text-[10px] text-rose-700 ml-3 leading-relaxed">• {a}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIInsightsBanner;
