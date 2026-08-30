import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Activity, BellRing, CheckCircle2, FileText, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { PERMISSIONS, ROLE_LABELS, hasPermission } from '../../constants/roles';

const SystemHealthDashboard = lazy(() => import('../SystemHealthDashboard'));
const AutomatedAlertsPanel = lazy(() => import('../AutomatedAlertsPanel'));
const DocumentExpirationTracker = lazy(() => import('../DocumentExpirationTracker'));
const FleetUtilizationReport = lazy(() => import('../FleetUtilizationReport'));

const MODULES = [
  { id: 'health', label: 'Health', title: 'System health', description: 'Live application and operational signals', icon: Activity },
  { id: 'alerts', label: 'Alerts', title: 'Automated alerts', description: 'Late trips, missed pickups, and fleet warnings', icon: BellRing },
  { id: 'documents', label: 'Documents', title: 'Compliance documents', description: 'License, insurance, and registration expirations', icon: FileText },
  { id: 'utilization', label: 'Utilization', title: 'Fleet utilization', description: 'Vehicle use and operational efficiency', icon: Truck },
  { id: 'access', label: 'Access', title: 'Roles and permissions', description: 'Least-privilege capability matrix', icon: ShieldCheck },
];

const LoadingPanel = () => <div className="flex min-h-48 items-center justify-center" role="status"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /></div>;

const PermissionMatrix = () => {
  const permissions = [...new Set(Object.values(PERMISSIONS).flatMap((entry) => Object.keys(entry)))];
  const roles = Object.keys(ROLE_LABELS);
  return (
    <div className="app-table-frame rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Capability</th>{roles.map((role) => <th key={role} className="px-3 py-2 text-center text-xs font-semibold text-slate-700">{ROLE_LABELS[role]}</th>)}</tr></thead>
        <tbody>{permissions.map((permission) => <tr key={permission} className="border-b border-slate-100"><td className="px-3 py-2 font-semibold text-slate-800">{permission.replace(/^can/, '').replace(/([A-Z])/g, ' $1').trim()}</td>{roles.map((role) => <td key={role} className="px-3 py-2 text-center">{hasPermission(role, permission) ? <CheckCircle2 size={17} className="inline text-emerald-600" /> : <XCircle size={17} className="inline text-slate-300" />}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
};

const SystemControlCenter = ({ trips = [], drivers = [], vehicles = [], logs = [], appSettings = {} }) => {
  const [module, setModule] = useState('health');
  const active = useMemo(() => MODULES.find((entry) => entry.id === module) || MODULES[0], [module]);
  const ActiveIcon = active.icon;
  const content = module === 'health'
    ? <SystemHealthDashboard trips={trips} drivers={drivers} logs={logs} appSettings={appSettings} />
    : module === 'alerts'
      ? <AutomatedAlertsPanel trips={trips} drivers={drivers} vehicles={vehicles} />
      : module === 'documents'
        ? <DocumentExpirationTracker drivers={drivers} vehicles={vehicles} />
        : module === 'utilization'
          ? <FleetUtilizationReport trips={trips} drivers={drivers} vehicles={vehicles} />
          : <PermissionMatrix />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><ActiveIcon size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">System control center</p><h3 className="text-lg font-semibold text-slate-950">{active.title}</h3><p className="text-xs font-semibold text-slate-600">{active.description}</p></div></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="System controls">
        {MODULES.map((entry) => { const Icon = entry.icon; const selected = module === entry.id; return <button key={entry.id} role="tab" aria-selected={selected} onClick={() => setModule(entry.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><Icon size={15} />{entry.label}</button>; })}
      </div>
      <Suspense fallback={<LoadingPanel />}><div role="tabpanel">{content}</div></Suspense>
    </div>
  );
};

export default React.memo(SystemControlCenter);
