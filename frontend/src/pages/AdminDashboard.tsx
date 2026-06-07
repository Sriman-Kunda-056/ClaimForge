import { useEffect, useState } from 'react';
import { getClaims, getStats, overrideClaim } from '../api';
import { useAuth } from '../context/AuthContext';
import type { ClaimRecord, Decision, DecisionType } from '../types';
import Navbar from '../components/Navbar';
import PolicyEditor from '../components/PolicyEditor';
import DecisionPanel from '../components/DecisionPanel';

const BADGE: Record<DecisionType, string> = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700',
};

const DECISION_COLOR: Record<string, string> = {
  APPROVED:      'bg-green-500',
  REJECTED:      'bg-red-500',
  PARTIAL:       'bg-amber-500',
  MANUAL_REVIEW: 'bg-orange-500',
};

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<'overview' | 'claims' | 'policy'>('overview');
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClaimRecord | null>(null);

  useEffect(() => {
    Promise.all([getClaims(token), getStats(token)])
      .then(([rows, s]) => {
        setClaims((rows as { claim_id: string; claim_json: ClaimRecord['claim']; decision_json: Decision; submitted_at: string; submitted_by: string }[]).map(r => ({
          id: r.claim_id, submittedAt: new Date(r.submitted_at), claim: r.claim_json, decision: r.decision_json,
          submitted_by: r.submitted_by,
        } as ClaimRecord & { submitted_by: string })));
        setStats(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleOverride(claimId: string, action: 'APPROVED' | 'REJECTED', reason: string) {
    await overrideClaim(claimId, action, reason, token);
    setClaims(c => c.map(r => r.id === claimId ? { ...r, decision: { ...r.decision, decision: action } } : r));
    if (selected?.id === claimId) setSelected(s => s ? { ...s, decision: { ...s.decision, decision: action } } : s);
  }

  const byDecision = (stats.by_decision as Record<string, number>) ?? {};
  const total = (stats.total_claims as number) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'claims', label: `Claims (${claims.length})` },
          { key: 'policy', label: 'Policy' },
        ]}
        activeTab={tab}
        onTabChange={k => setTab(k as 'overview' | 'claims' | 'policy')}
      />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 space-y-5">
        {tab === 'overview' && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Claims', value: String(total), icon: '📋', color: 'text-gray-800' },
                { label: 'Approval Rate', value: stats.approval_rate ? `${stats.approval_rate}%` : '—', icon: '✅', color: 'text-green-600' },
                { label: 'Total Approved', value: stats.total_approved_amount ? `₹${Number(stats.total_approved_amount).toLocaleString('en-IN')}` : '—', icon: '💰', color: 'text-blue-600' },
                { label: 'Pending Review', value: String(stats.pending_review ?? '—'), icon: '⏳', color: 'text-orange-600' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 font-medium">{k.label}</p>
                    <span className="text-lg">{k.icon}</span>
                  </div>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Decision breakdown */}
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-600 mb-4">Decision Breakdown</h3>
                {loading ? <div className="h-32 animate-pulse bg-gray-100 rounded-lg" /> : (
                  <div className="space-y-3">
                    {Object.entries(byDecision).map(([decision, count]) => {
                      const pct = total ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={decision}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${BADGE[decision as DecisionType] ?? 'bg-gray-100 text-gray-700'}`}>
                              {decision.replace('_', ' ')}
                            </span>
                            <span className="text-gray-500">{count} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${DECISION_COLOR[decision] ?? 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-600 mb-4">AI Performance</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Total AI Calls', value: String(stats.total_ai_calls ?? '—') },
                    { label: 'Total Tokens Used', value: stats.total_tokens_used ? Number(stats.total_tokens_used).toLocaleString() : '—' },
                    { label: 'Avg Claim Amount', value: stats.avg_claim_amount ? `₹${Number(stats.avg_claim_amount).toFixed(0)}` : '—' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-500">{item.label}</span>
                      <span className="text-sm font-semibold text-gray-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent claims */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-600">Recent Claims</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{['Member', 'Date', 'Claimed', 'Approved', 'Status', 'By'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {claims.slice(0, 8).map((rec, i) => (
                    <tr key={rec.id} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`} onClick={() => { setSelected(rec); setTab('claims'); }}>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{rec.claim.member_name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{rec.claim.treatment_date}</td>
                      <td className="px-4 py-2.5 text-gray-700">₹{rec.claim.claim_amount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-700">₹{rec.decision.approved_amount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[rec.decision.decision]}`}>{rec.decision.decision.replace('_', ' ')}</span></td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{String((rec as unknown as Record<string,unknown>).submitted_by ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'claims' && (
          <div className="grid xl:grid-cols-5 gap-5">
            <div className="xl:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Member', 'Date', 'Claimed', 'Decision', 'By'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {claims.map((rec, i) => (
                    <tr key={rec.id} onClick={() => setSelected(rec)}
                      className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors
                        ${selected?.id === rec.id ? 'bg-blue-50' : i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{rec.claim.member_name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{rec.claim.treatment_date}</td>
                      <td className="px-4 py-2.5 text-gray-700">₹{rec.claim.claim_amount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[rec.decision.decision]}`}>{rec.decision.decision.replace('_',' ')}</span></td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{String((rec as unknown as Record<string,unknown>).submitted_by ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="xl:col-span-2">
              {selected ? (
                <div className="sticky top-20">
                  <DecisionPanel decision={selected.decision} claimedAmount={selected.claim.claim_amount} claimId={selected.id} role={user!.role} onOverride={handleOverride} />
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-300 sticky top-20">
                  <p className="text-sm">Click a row to inspect</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'policy' && <PolicyEditor />}
      </div>
    </div>
  );
}
