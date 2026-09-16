import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, ChevronUp, User, Clock, Edit2, Archive, 
  AlertCircle, CheckCircle2, XCircle, RotateCcw, Navigation,
  MapPin, Phone, MessageSquare, History
} from 'lucide-react';
import { designTokens } from '../../utils/designTokens';

const FALLBACK = () => <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;

const ACTION_ICONS = {
  edit: Edit2, create: Edit2, assign: User, unassign: User,
  drive: Navigation, complete: CheckCircle2, noshow: AlertCircle,
  cancel: XCircle, reroute: RotateCcw, archive: Archive,
  message: MessageSquare, call: Phone, navigate: MapPin,
  status: History, update: Edit2, note: Edit2,
};

const getActionConfig = (action) => {
  const a = String(action || '').toLowerCase();
  if (a.includes('edit') || a.includes('update') || a.includes('modify') || a.includes('create')) return { icon: Edit2, color: 'blue', label: 'Edited' };
  if (a.includes('assign')) return { icon: User, color: 'blue', label: 'Assigned' };
  if (a.includes('drive') || a.includes('workflow')) return { icon: Navigation, color: 'blue', label: 'Workflow' };
  if (a.includes('complete')) return { icon: CheckCircle2, color: 'emerald', label: 'Completed' };
  if (a.includes('no show') || a.includes('noshow')) return { icon: AlertCircle, color: 'orange', label: 'No Show' };
  if (a.includes('cancel')) return { icon: XCircle, color: 'slate', label: 'Cancelled' };
  if (a.includes('reroute')) return { icon: RotateCcw, color: 'amber', label: 'Rerouted' };
  if (a.includes('archive') || a.includes('delete')) return { icon: Archive, color: 'rose', label: 'Archived' };
  if (a.includes('message') || a.includes('sms')) return { icon: MessageSquare, color: 'blue', label: 'Messaged' };
  if (a.includes('call')) return { icon: Phone, color: 'blue', label: 'Called' };
  if (a.includes('navigate')) return { icon: MapPin, color: 'blue', label: 'Navigated' };
  if (a.includes('status')) return { icon: History, color: 'purple', label: 'Status Change' };
  return { icon: History, color: 'slate', label: 'Action' };
};

const formatTimestamp = (ts) => {
  if (!ts) return '';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString([], { 
      month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  } catch { return String(ts); }
};

const AuditHistory = ({ entries = [], loading, tripId }) => {
  const tokens = designTokens;
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && !entries.length) return <FALLBACK />;

  if (entries.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <History size={24} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-900">No audit history</p>
        <p className="text-xs text-slate-500 mt-1">Changes will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Audit history">
      {entries.map((entry, index) => {
        const config = getActionConfig(entry.action || entry.type);
        const Icon = config.icon;
        const expanded = expandedIds.has(entry.id || index);
        
        return (
          <div 
            key={entry.id || index} 
            role="listitem"
            className={`rounded-xl border overflow-hidden ${tokens.colors.background.secondary} ${tokens.elevation.sm} ${expanded ? 'ring-1 ring-blue-200' : ''}`}
          >
            <button
              type="button"
              onClick={() => toggleExpanded(entry.id || index)}
              className="w-full px-4 py-3 flex items-start gap-3 text-left touch-manipulation"
              aria-expanded={expanded}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.color === 'blue' ? 'bg-blue-100 text-blue-600' : config.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : config.color === 'amber' ? 'bg-amber-100 text-amber-600' : config.color === 'orange' ? 'bg-orange-100 text-orange-600' : config.color === 'rose' ? 'bg-rose-100 text-rose-600' : config.color === 'purple' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className={`font-semibold text-sm ${tokens.colors.foreground.primary} truncate`}>
                    {config.label}
                  </p>
                  {entry.by && (
                    <span className={`shrink-0 px-2 py-0.5 rounded-full ${tokens.typography.caption2} bg-slate-100 text-slate-600`}>
                      {entry.by}
                    </span>
                  )}
                  <span className={`shrink-0 ${tokens.typography.caption1} ${tokens.colors.foreground.tertiary}`}>
                    {formatTimestamp(entry.timestamp || entry.createdAt || entry.at)}
                  </span>
                </div>
                {entry.detail && (
                  <p className={`mt-1 text-sm ${tokens.colors.foreground.secondary} truncate`}>
                    {entry.detail}
                  </p>
                )}
                {entry.field && entry.before !== undefined && entry.after !== undefined && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">{entry.field}</span>
                    <span className="text-slate-400">→</span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono">{entry.after}</span>
                  </div>
                )}
              </div>
              <ChevronDown size={20} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && entry.diffs && entry.diffs.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 pb-3">
                <p className={`${tokens.typography.caption2Upper} ${tokens.colors.foreground.tertiary} mb-2`} style={{ letterSpacing: '0.08em' }}>Field Changes</p>
                <div className="space-y-1.5">
                  {entry.diffs.map((diff, di) => (
                    <div key={di} className="flex items-center gap-2 text-xs font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{diff.field}</span>
                      <span className="text-slate-400">→</span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 truncate max-w-[40%]">{diff.before}</span>
                      <span className="text-slate-400">→</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 truncate max-w-[40%]">{diff.after}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(AuditHistory);