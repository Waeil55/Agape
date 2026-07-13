import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Calendar, FileText, Filter, RefreshCw, X } from 'lucide-react';
import { localCalendarYmd } from '../utils/tripDate';

const DOC_CATEGORIES = [
  { id: 'driver_license', label: 'Driver License', source: 'driver' },
  { id: 'vehicle_registration', label: 'Vehicle Registration', source: 'vehicle' },
  { id: 'insurance', label: 'Insurance', source: 'vehicle' },
  { id: 'medical_certificate', label: 'Medical Certificate', source: 'driver' },
  { id: 'drug_test', label: 'Drug Test', source: 'driver' },
];

const STATUS_CONFIG = {
  expired: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', label: 'Expired', icon: AlertTriangle },
  expiring: { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', label: 'Expiring Soon', icon: AlertTriangle },
  valid: { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', label: 'Valid', icon: CheckCircle },
  unknown: { color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600', label: 'No Record', icon: FileText },
};

function getDaysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  const now = new Date();
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(dateStr) {
  if (!dateStr) return 'unknown';
  const days = getDaysUntilExpiry(dateStr);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

const titleCase = (str) => String(str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function getEntityDocs(entity, source) {
  if (!entity || !entity.id) return [];
  const name = entity.name || entity.plate || 'Unknown';
  // Prefer a real `documents` array (DocumentManager format) with actual expiry dates
  if (Array.isArray(entity.documents) && entity.documents.length) {
    const real = entity.documents
      .filter(d => d && d.expiryDate)
      .map(d => ({
        id: `${entity.id}-${d.type || 'doc'}`,
        entityId: entity.id,
        entityName: name,
        entityType: source,
        category: d.type || 'doc',
        categoryLabel: titleCase(d.type || 'Document'),
        expiryDate: d.expiryDate,
        renewed: false,
        source: 'record',
      }));
    if (real.length) return real;
  }
  const docs = [];
  if (source === 'vehicle' && entity.insuranceExpiry) {
    docs.push({
      id: `${entity.id}-insurance`,
      entityId: entity.id,
      entityName: name,
      entityType: 'vehicle',
      category: 'insurance',
      categoryLabel: 'Insurance',
      expiryDate: entity.insuranceExpiry,
      renewed: false,
      source: 'record',
    });
  }
  if (docs.length === 0) {
    docs.push({
      id: `${entity.id}-none`,
      entityId: entity.id,
      entityName: name,
      entityType: source,
      category: 'none',
      categoryLabel: source === 'vehicle' ? 'Vehicle Documents' : 'Driver Documents',
      expiryDate: null,
      renewed: false,
      source: 'none',
    });
  }
  return docs;
}

function generateDocuments(drivers = [], vehicles = []) {
  const docs = [];
  drivers.forEach(driver => docs.push(...getEntityDocs(driver, 'driver')));
  vehicles.forEach(vehicle => docs.push(...getEntityDocs(vehicle, 'vehicle')));
  return docs;
}

export default function DocumentExpirationTracker({ drivers = [], vehicles = [] }) {
  const [documents, setDocuments] = useState(() => generateDocuments(drivers, vehicles));
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const docsWithStatus = useMemo(() =>
    documents.map(doc => ({
      ...doc,
      status: doc.renewed ? 'valid' : getExpiryStatus(doc.expiryDate),
      daysLeft: getDaysUntilExpiry(doc.expiryDate),
    })),
    [documents]
  );

  const filteredDocs = useMemo(() =>
    statusFilter === 'all' ? docsWithStatus : docsWithStatus.filter(d => d.status === statusFilter),
    [docsWithStatus, statusFilter]
  );

  const summary = useMemo(() => {
    const s = { expired: 0, expiring: 0, valid: 0, unknown: 0 };
    docsWithStatus.forEach(d => { s[d.status]++; });
    return s;
  }, [docsWithStatus]);

  const handleRenew = (docId) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, renewed: true, expiryDate: localCalendarYmd(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) } : d));
  };

  const filterOptions = [
    { key: 'all', label: 'All', count: docsWithStatus.length },
    { key: 'expired', label: 'Expired', count: summary.expired },
    { key: 'expiring', label: 'Expiring Soon', count: summary.expiring },
    { key: 'valid', label: 'Valid', count: summary.valid },
    { key: 'unknown', label: 'No Record', count: summary.unknown },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-900">Document Expiration Tracker</h2>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            <Filter size={12} />
            {filterOptions.find(f => f.key === statusFilter)?.label}
          </button>
          {showFilterMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
              {filterOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setStatusFilter(opt.key); setShowFilterMenu(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition ${statusFilter === opt.key ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'}`}
                >
                  <span>{opt.label}</span>
                  <span className="font-bold text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{opt.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
              <Icon size={12} />
              <span>{summary[key]}</span>
              <span className="text-[10px] opacity-70">{cfg.label}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {filteredDocs.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-xs">No documents match this filter.</div>
        )}
        {filteredDocs.map(doc => {
          const cfg = STATUS_CONFIG[doc.status];
          const Icon = cfg.icon;
          return (
            <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.border} ${cfg.bg} transition`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                <Icon size={16} className={cfg.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 truncate">{doc.entityName}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-500">{doc.categoryLabel}</span>
                  <span className="text-[10px] text-slate-400">|</span>
                  <Calendar size={10} className="text-slate-400" />
                  <span className="text-[10px] text-slate-500">
                    {doc.expiryDate}
                  </span>
                  {doc.daysLeft !== null && (
                    <span className={`text-[10px] font-semibold ${doc.daysLeft < 0 ? 'text-red-500' : doc.daysLeft <= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {doc.daysLeft < 0 ? `${Math.abs(doc.daysLeft)}d overdue` : `${doc.daysLeft}d left`}
                    </span>
                  )}
                </div>
              </div>
              {!doc.renewed && doc.source === 'record' && (
                <button
                  onClick={() => handleRenew(doc.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition shrink-0"
                >
                  <RefreshCw size={10} />
                  Renew
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showFilterMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
      )}
    </div>
  );
}
