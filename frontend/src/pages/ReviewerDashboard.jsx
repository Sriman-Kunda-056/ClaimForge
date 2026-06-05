import { useEffect, useState } from 'react';
import { getClaims, getStats, overrideClaim } from '../api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import DecisionPanel from '../components/DecisionPanel';

const BADGE = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700 ring-2 ring-orange-300',
};

export default function ReviewerDashboard() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState('queue');
  const [filter, setFilter] = useState('all');
  const [claims, setClaims] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([
      getClaims(token),
      getStats(token),
    ]).then(([rows, s]) => {
      setClaims(rows.map(r => ({
        id: r.claim_id, submittedAt: new Date(r.submitted_at), claim: r.claim_json, decision: r.decision_json,
      })));
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function handleOverride(claimId, action, reason) {
    await overrideClaim(claimId, action, reason, token);
    setClaims(c => c.map(r => r.id === claimId ? { ...r, decision: { ...r.decision, decision: action } } : r));
    if (selected?.id === claimId) setSelected(s => s ? { ...s, decision: { ...s.decision, decision: action } } : s);
  }

  const queue = claims.filter(c => c.decision.decision === 'MANUAL_REVIEW');
  const filtered = filter === 'all' ? claims : claims.filter(c => c.decision.decision === filter);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar
        tabs={[{ key: 'queue', label: `Review Queue (${queue.length})` }, { key: 'all', label: `All Claims (${claims.length})` }]}
        activeTab={tab}
        onTabChange={k => setTab(k)}
      />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 space-y-5">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pending Review', value: String(stats.pending_review ?? '—'), color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Total Claims', value: String(stats.total_claims ?? '—'), color: 'text-gray-700', bg: 'bg-white' },
            { label: 'Approval Rate', value: stats.approval_rate ? `${stats.approval_rate}%` : '—', color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total Approved', value: stats.total_approved_amount ? `₹${Number(stats.total_approved_amount).toLocaleString('en-IN')}` : '—', color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4`}>
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid xl:grid-cols-5 gap-5">
          {/* Claims list */}
          <div className="xl:col-span-3 space-y-3">
            {tab === 'all' && (
              <div className="flex gap-2 flex-wrap">
                {['all', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'PARTIAL'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
                      ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border animate-pulse" />)}</div>
            ) : (tab === 'queue' ? queue : filtered).length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-dashed border-gray-200">
                {tab === 'queue' ? '✓ No claims pending review' : 'No claims match this filter'}
              </div>
            ) : (
              (tab === 'queue' ? queue : filtered).map(rec => (
                <button key={rec.id} onClick={() => setSelected(selected?.id === rec.id ? null : rec)}
                  className={`w-full text-left bg-white rounded-xl border p-4 transition-all hover:shadow-sm
                    ${selected?.id === rec.id ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}
                    ${rec.decision.decision === 'MANUAL_REVIEW' ? 'border-l-4 border-l-orange-400' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{rec.claim.member_name}
                        <span className="ml-2 text-xs text-gray-400 font-normal">{rec.claim.member_id}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rec.claim.treatment_date} · {rec.claim.prescription?.diagnosis ?? 'No diagnosis'} · Submitted by {String(rec.submitted_by ?? 'unknown')}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full block ${BADGE[rec.decision.decision]}`}>
                        {rec.decision.decision.replace('_', ' ')}
                      </span>
                      <p className="text-xs text-gray-500">₹{rec.claim.claim_amount.toLocaleString('en-IN')} claimed</p>
                    </div>
                  </div>
                  {rec.decision.flags?.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {rec.decision.flags.map(f => (
                        <span key={f} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{f}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Detail panel */}
          <div className="xl:col-span-2">
            {selected ? (
              <div className="space-y-3 sticky top-20">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Claim Details</p>
                  <dl className="space-y-1.5 text-sm">
                    {[
                      ['Member', selected.claim.member_name],
                      ['ID', selected.claim.member_id],
                      ['Treatment', selected.claim.treatment_date],
                      ['Hospital', selected.claim.hospital ?? 'Not specified'],
                      ['Submitted by', String(selected.submitted_by ?? '—')],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-gray-400 w-24 shrink-0">{k}</dt>
                        <dd className="text-gray-700 font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <DecisionPanel
                  decision={selected.decision}
                  claimedAmount={selected.claim.claim_amount}
                  claimId={selected.id}
                  role={user.role}
                  onOverride={handleOverride}
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-300 sticky top-20">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
                <p className="text-sm">Click a claim to review it</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
