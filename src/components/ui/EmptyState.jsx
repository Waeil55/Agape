import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', hint, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-slate-400" />
      </div>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs font-medium text-slate-500 max-w-[240px]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
