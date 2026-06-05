import { useEffect, useState } from 'react';
import { getPolicy, updatePolicy } from '../api';
import { useAuth } from '../context/AuthContext';

function NInput({ label, value, onChange, prefix, suffix, type = 'number', min }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-300">
        {prefix && <span className="px-2 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-200">{prefix}</span>}
        <input
          type={type}
          value={value}
          min={min ?? 0}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 px-3 py-2 text-sm focus:outline-none"
        />
        {suffix && <span className="px-2 py-2 bg-gray-50 text-gray-400 text-sm border-l border-gray-200">{suffix}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  );
}

function ListEditor({ label, items, onChange }) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (v && !items.includes(v)) { onChange([...items, v]); setDraft(''); }
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      <div className="space-y-1.5 mb-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
            <span className="text-sm text-gray-700">{item}</span>
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-400 text-lg leading-none ml-2">×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder={`Add ${label.toLowerCase()}…`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-600 border-b border-gray-100 pb-2">{title}</h3>
      {children}
    </div>
  );
}

export default function PolicyEditor() {
  const { token } = useAuth();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPolicy(token).then(p => setPolicy(p)).finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    if (!policy) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      await updatePolicy(policy, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function set(path, value) {
    setPolicy(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      let node = next;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
      node[path[path.length - 1]] = value;
      return next;
    });
  }

  if (loading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl" />)}</div>;
  if (!policy) return <p className="text-red-500 text-sm">Failed to load policy.</p>;

  const cd = policy.coverage_details;
  const wp = policy.waiting_periods;

  return (
    <div className="space-y-4">
      {/* Save bar */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3 sticky top-16 z-10">
        <div>
          <p className="text-sm font-semibold text-gray-700">{policy.policy_name}</p>
          <p className="text-xs text-gray-400 font-mono">{policy.policy_id} · Effective {policy.effective_date}</p>
        </div>
        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && <p className="text-xs text-green-600 font-medium flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Saved!</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</> : 'Save Policy'}
          </button>
        </div>
      </div>

      {/* Limits */}
      <Section title="💰 Claim Limits">
        <div className="grid grid-cols-3 gap-4">
          <NInput label="Per-Claim Limit" prefix="₹" value={cd.per_claim_limit} onChange={v => set(['coverage_details','per_claim_limit'], v)} />
          <NInput label="Annual Limit" prefix="₹" value={cd.annual_limit} onChange={v => set(['coverage_details','annual_limit'], v)} />
          <NInput label="Family Floater Limit" prefix="₹" value={cd.family_floater_limit} onChange={v => set(['coverage_details','family_floater_limit'], v)} />
        </div>
      </Section>

      {/* Consultation */}
      <Section title="🩺 Consultation Fees">
        <div className="grid grid-cols-2 gap-4">
          <NInput label="Sub-Limit" prefix="₹" value={cd.consultation_fees.sub_limit} onChange={v => set(['coverage_details','consultation_fees','sub_limit'], v)} />
          <NInput label="Co-pay %" suffix="%" value={cd.consultation_fees.copay_percentage} onChange={v => set(['coverage_details','consultation_fees','copay_percentage'], v)} min={0} />
          <NInput label="Network Discount %" suffix="%" value={cd.consultation_fees.network_discount} onChange={v => set(['coverage_details','consultation_fees','network_discount'], v)} min={0} />
        </div>
        <Toggle label="Covered" checked={cd.consultation_fees.covered} onChange={v => set(['coverage_details','consultation_fees','covered'], v)} />
      </Section>

      {/* Diagnostics + Pharmacy + Dental + Vision + Alternative */}
      <div className="grid grid-cols-2 gap-4">
        <Section title="🔬 Diagnostic Tests">
          <NInput label="Sub-Limit" prefix="₹" value={cd.diagnostic_tests.sub_limit} onChange={v => set(['coverage_details','diagnostic_tests','sub_limit'], v)} />
          <Toggle label="Covered" checked={cd.diagnostic_tests.covered} onChange={v => set(['coverage_details','diagnostic_tests','covered'], v)} />
          <Toggle label="Pre-auth Required" checked={cd.diagnostic_tests.pre_authorization_required} onChange={v => set(['coverage_details','diagnostic_tests','pre_authorization_required'], v)} />
        </Section>

        <Section title="💊 Pharmacy">
          <NInput label="Sub-Limit" prefix="₹" value={cd.pharmacy.sub_limit} onChange={v => set(['coverage_details','pharmacy','sub_limit'], v)} />
          <NInput label="Branded Drug Co-pay %" suffix="%" value={cd.pharmacy.branded_drugs_copay} onChange={v => set(['coverage_details','pharmacy','branded_drugs_copay'], v)} />
          <Toggle label="Generic Drugs Mandatory" checked={cd.pharmacy.generic_drugs_mandatory} onChange={v => set(['coverage_details','pharmacy','generic_drugs_mandatory'], v)} />
        </Section>

        <Section title="🦷 Dental">
          <NInput label="Sub-Limit" prefix="₹" value={cd.dental.sub_limit} onChange={v => set(['coverage_details','dental','sub_limit'], v)} />
          <NInput label="Routine Checkup Limit" prefix="₹" value={cd.dental.routine_checkup_limit} onChange={v => set(['coverage_details','dental','routine_checkup_limit'], v)} />
          <Toggle label="Cosmetic Procedures" checked={cd.dental.cosmetic_procedures} onChange={v => set(['coverage_details','dental','cosmetic_procedures'], v)} />
        </Section>

        <Section title="🌿 Alternative Medicine">
          <NInput label="Sub-Limit" prefix="₹" value={cd.alternative_medicine.sub_limit} onChange={v => set(['coverage_details','alternative_medicine','sub_limit'], v)} />
          <NInput label="Max Therapy Sessions" value={cd.alternative_medicine.therapy_sessions_limit} onChange={v => set(['coverage_details','alternative_medicine','therapy_sessions_limit'], v)} />
          <Toggle label="Covered" checked={cd.alternative_medicine.covered} onChange={v => set(['coverage_details','alternative_medicine','covered'], v)} />
        </Section>
      </div>

      {/* Cashless */}
      <Section title="🏥 Cashless Facilities">
        <div className="grid grid-cols-2 gap-4">
          <NInput label="Instant Approval Limit" prefix="₹" value={policy.cashless_facilities.instant_approval_limit} onChange={v => set(['cashless_facilities','instant_approval_limit'], v)} />
        </div>
        <div className="flex gap-6 flex-wrap">
          <Toggle label="Available" checked={policy.cashless_facilities.available} onChange={v => set(['cashless_facilities','available'], v)} />
          <Toggle label="Network Only" checked={policy.cashless_facilities.network_only} onChange={v => set(['cashless_facilities','network_only'], v)} />
          <Toggle label="Pre-approval Required" checked={policy.cashless_facilities.pre_approval_required} onChange={v => set(['cashless_facilities','pre_approval_required'], v)} />
        </div>
      </Section>

      {/* Waiting Periods */}
      <Section title="⏳ Waiting Periods">
        <div className="grid grid-cols-3 gap-4">
          <NInput label="Initial Waiting (days)" suffix="days" value={wp.initial_waiting} onChange={v => set(['waiting_periods','initial_waiting'], v)} />
          <NInput label="Pre-existing Diseases (days)" suffix="days" value={wp.pre_existing_diseases} onChange={v => set(['waiting_periods','pre_existing_diseases'], v)} />
          <NInput label="Maternity (days)" suffix="days" value={wp.maternity} onChange={v => set(['waiting_periods','maternity'], v)} />
          <NInput label="Diabetes (days)" suffix="days" value={wp.specific_ailments.diabetes} onChange={v => set(['waiting_periods','specific_ailments','diabetes'], v)} />
          <NInput label="Hypertension (days)" suffix="days" value={wp.specific_ailments.hypertension} onChange={v => set(['waiting_periods','specific_ailments','hypertension'], v)} />
          <NInput label="Joint Replacement (days)" suffix="days" value={wp.specific_ailments.joint_replacement} onChange={v => set(['waiting_periods','specific_ailments','joint_replacement'], v)} />
        </div>
      </Section>

      {/* Exclusions + Network Hospitals */}
      <div className="grid grid-cols-2 gap-4">
        <Section title="🚫 Exclusions">
          <ListEditor label="Exclusions" items={policy.exclusions} onChange={v => set(['exclusions'], v)} />
        </Section>
        <Section title="🏨 Network Hospitals">
          <ListEditor label="Network Hospitals" items={policy.network_hospitals} onChange={v => set(['network_hospitals'], v)} />
        </Section>
      </div>
    </div>
  );
}
