import { useState } from 'react';
import { Plus, ShieldOff, Trash2 } from 'lucide-react';
import { addOverrideExclusionRule, normalizeOverridePolicy } from '../utils/tripCostOverrides';

const SCOPE_LABELS = {
  waiting: 'Waiting only',
  mileage: 'Unloaded mileage only',
  all: 'All override calculations',
};

const cityLabel = (value, side) => value === '*' ? `Any ${side}` : value;

export const getOverrideExclusionPolicyUpdates = (policy) => ({
  excludedCityPairs: [],
  overrideExclusionRules: normalizeOverridePolicy(policy).overrideExclusionRules,
});

const OverrideExclusionRulesEditor = ({ policy, onChange, disabled = false, compact = false }) => {
  const normalizedPolicy = normalizeOverridePolicy(policy);
  const rules = normalizedPolicy.overrideExclusionRules;
  const [scope, setScope] = useState('waiting');
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('*');
  const [status, setStatus] = useState('');

  const updateRules = (nextRules) => onChange?.({
    ...normalizedPolicy,
    excludedCityPairs: [],
    overrideExclusionRules: nextRules,
  });
  const addRule = () => {
    if (!fromCity.trim() || !toCity.trim()) {
      setStatus('Enter a From city and choose an exact or any destination.');
      return;
    }
    const nextRules = addOverrideExclusionRule(normalizedPolicy, { scope, fromCity, toCity });
    if (nextRules.length === rules.length && nextRules.every((rule, index) => rule.id === rules[index]?.id)) {
      setStatus('That rule is already covered by an existing rule.');
      return;
    }
    updateRules(nextRules);
    setStatus('Rule added. Save the policy to apply it.');
    setFromCity('');
    setToCity('*');
  };
  const removeRule = (ruleId) => {
    updateRules(rules.filter((rule) => rule.id !== ruleId));
    setStatus('Rule removed. Save the policy to apply the change.');
  };

  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`} aria-labelledby="override-exclusion-heading">
      <div className="flex items-start gap-2">
        <ShieldOff size={18} className="mt-0.5 shrink-0 text-rose-600" />
        <div>
          <h4 id="override-exclusion-heading" className="text-sm font-semibold text-slate-900">Directional exclusion rules</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">Choose exactly what is excluded. Rules are directional: Indianapolis → Carmel does not affect Carmel → Indianapolis.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto]">
        <label className="text-xs font-semibold text-slate-600">Exclude
          <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={disabled} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold">
            <option value="waiting">Waiting time only</option>
            <option value="mileage">Unloaded mileage only</option>
            <option value="all">All override calculations</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">From city
          <input value={fromCity} onChange={(event) => setFromCity(event.target.value)} disabled={disabled} placeholder="Indianapolis" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold" />
        </label>
        <div className="text-xs font-semibold text-slate-600">To city
          <span className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
            <input aria-label="Rule destination city" value={toCity === '*' ? '' : toCity} onChange={(event) => setToCity(event.target.value)} disabled={disabled || toCity === '*'} placeholder={toCity === '*' ? 'Any destination' : 'Carmel'} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold" />
            <label className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-600"><input type="checkbox" checked={toCity === '*'} onChange={(event) => setToCity(event.target.checked ? '*' : '')} disabled={disabled} /> Any</label>
          </span>
        </div>
        <div className="flex items-end"><button type="button" onClick={addRule} disabled={disabled} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-40"><Plus size={14} /> Add rule</button></div>
      </div>

      <div className="mt-3 space-y-2">
        {rules.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">No route exclusions. Eligible mileage and waiting are calculated normally.</p>}
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${rule.scope === 'all' ? 'bg-rose-100 text-rose-800' : rule.scope === 'waiting' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{SCOPE_LABELS[rule.scope]}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800" title={`${cityLabel(rule.fromCity, 'origin')} → ${cityLabel(rule.toCity, 'destination')}`}>{cityLabel(rule.fromCity, 'origin')} → {cityLabel(rule.toCity, 'destination')}</span>
            <button type="button" onClick={() => removeRule(rule.id)} disabled={disabled} aria-label={`Remove ${SCOPE_LABELS[rule.scope]} rule for ${rule.fromCity} to ${rule.toCity}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-slate-600"><strong>Examples:</strong> Waiting only + Indianapolis → Indianapolis removes only wait pay for that route. Waiting only + Indianapolis → Any removes waiting for every destination while keeping eligible mileage. All override calculations removes both.</p>
      {status && <p className="mt-2 text-xs font-semibold text-blue-700" role="status">{status}</p>}
    </section>
  );
};

export default OverrideExclusionRulesEditor;
