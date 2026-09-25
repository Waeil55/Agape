import { Fragment, useEffect, useState } from 'react';
import { Flag, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { db, collection, onSnapshot } from '../config/firebase';
import { unflagClient, reactivateFlaggedClient } from '../utils/flaggedClients';

const formatWhen = (value) => {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

export default function FlaggedClientsSection({ role }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState('');
  const canManage = role === 'admin';

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'flaggedClients'),
      (snap) => {
        setClients(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const sorted = [...clients].sort((a, b) => {
    if (Boolean(a.active) !== Boolean(b.active)) return a.active ? -1 : 1;
    return (b.reportCount || 0) - (a.reportCount || 0);
  });

  const toggleActive = async (client) => {
    setBusyId(client.id);
    try {
      if (client.active === false) await reactivateFlaggedClient(client.patientName || client.id);
      else await unflagClient(client.patientName || client.id);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-heading font-semibold text-slate-900">Reported clients</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Clients flagged from a trip's ⋯ menu as "Report as Bad Client". Visible to every operator so a booking can be reviewed before it's confirmed.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-400">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <Flag size={22} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No clients have been reported.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="app-table-frame">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reports</th>
                <th className="px-3 py-2">Last reason</th>
                <th className="px-3 py-2">Last reported</th>
                {canManage && <th className="px-3 py-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((client) => {
                const isExpanded = expandedId === client.id;
                const reports = Array.isArray(client.reports) ? [...client.reports].reverse() : [];
                return (
                  <Fragment key={client.id}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-bold text-slate-900">{client.patientName || client.id}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${client.active === false ? 'bg-slate-100 text-slate-500' : 'bg-rose-100 text-rose-700'}`}>
                          {client.active === false ? 'Cleared' : 'Flagged'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700">{client.reportCount || reports.length || 1}</td>
                      <td className="px-3 py-2 text-slate-600">{client.lastReason || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{formatWhen(client.lastReportedAt)}</td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {reports.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : client.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
                                aria-label={isExpanded ? 'Hide report history' : 'Show report history'}
                              >
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === client.id}
                              onClick={() => toggleActive(client)}
                              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold disabled:opacity-50 ${client.active === false ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                            >
                              <RotateCcw size={11} /> {client.active === false ? 'Re-flag' : 'Clear'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && reports.length > 0 && (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="bg-slate-50/70 px-3 py-2">
                          <div className="space-y-1.5">
                            {reports.map((report, index) => (
                              <div key={index} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                                <p className="text-[11px] font-bold text-slate-700">{report.reason || 'No reason given'}</p>
                                {report.note && <p className="mt-0.5 text-[11px] text-slate-500">{report.note}</p>}
                                <p className="mt-0.5 text-[10px] text-slate-400">{report.reportedBy || 'Unknown'} · {formatWhen(report.reportedAt)}{report.bookingId ? ` · Booking ${report.bookingId}` : ''}</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
