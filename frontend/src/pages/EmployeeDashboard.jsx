import { useEffect, useState } from 'react';
import { adjudicate, getClaims } from '../api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import DocumentUpload from '../components/DocumentUpload';
import ClaimForm from '../components/ClaimForm';
import DecisionPanel from '../components/DecisionPanel';
import TestCasesSidebar from '../components/TestCasesSidebar';
import { TEST_CASES } from '../testCases';

const STATUS_BADGE = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700',
};

export default function EmployeeDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState('submit');

  const [formKey, setFormKey] = useState(0);
  const [formValues, setFormValues] = useState({});
  const [extractedFields, setExtractedFields] = useState(null);
  const [activeCaseIdx, setActiveCaseIdx] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState(null);
  const [submittedClaim, setSubmittedClaim] = useState(null);

  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setHistLoading(true);
    getClaims(token)
      .then(rows => { if (active) setHistory(rows.map(r => ({
        id: r.claim_id, submittedAt: new Date(r.submitted_at), claim: r.claim_json, decision: r.decision_json,
      }))) })
      .catch(() => {})
      .finally(() => { if (active) setHistLoading(false); });
    return () => { active = false; };
  }, [token]);

  function loadTestCase(idx) {
    setActiveCaseIdx(idx);
    setFormValues(TEST_CASES[idx].claim);
    setExtractedFields(null);
    setFormKey(k => k + 1);
    setDecision(null);
    setError('');
    setTab('submit');
  }

  async function handleSubmit(claim) {
    setLoading(true); setError(''); setDecision(null);
    try {
      // When a test case is loaded:
      // 1. Use an isolated member ID so repeated submissions don't accumulate same-day counts.
      // 2. Restore previous_claims_same_day from the original test case data — the form
      //    doesn't show this field (it's auto-computed for real claims) but test cases
      //    like TC008 rely on it to simulate prior same-day submissions.
      const submittable = activeCaseIdx !== null
        ? {
            ...claim,
            member_id: `TC_${Date.now()}_${claim.member_id}`,
            previous_claims_same_day: TEST_CASES[activeCaseIdx].claim.previous_claims_same_day ?? 0,
          }
        : claim;
      const result = await adjudicate(submittable, token);
      const rec = { id: result.claim_id, submittedAt: new Date(), claim, decision: result };
      setDecision(result); setSubmittedClaim(claim);
      setHistory(h => [rec, ...h]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar
        tabs={[{ key: 'submit', label: 'New Claim' }, { key: 'history', label: `My Claims (${history.length})` }]}
        activeTab={tab}
        onTabChange={k => setTab(k)}
      />

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-4 py-6 gap-5">
        {/* Left sidebar — test cases */}
        <aside className="w-64 shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Quick Load Test Cases</p>
          <TestCasesSidebar onLoad={loadTestCase} activeIdx={activeCaseIdx} />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {tab === 'submit' && (
            <div className="grid xl:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-700">
                    {activeCaseIdx !== null ? `Test Case: ${TEST_CASES[activeCaseIdx].case_id}` : 'Submit New Claim'}
                  </h2>
                  {activeCaseIdx !== null && (
                    <button onClick={() => { setActiveCaseIdx(null); setFormValues({}); setFormKey(k => k + 1); setDecision(null); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                  )}
                </div>

                {/* Document upload with AI extraction */}
                <DocumentUpload onExtracted={f => setExtractedFields(f)} />

                <ClaimForm key={formKey} initialValues={formValues} extractedFields={extractedFields} onSubmit={handleSubmit} loading={loading} autoFillUser={activeCaseIdx === null} />
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-700 mb-4">Decision Result</h2>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-4">{error}</div>}
                {decision && submittedClaim ? (
                  <div className="space-y-3">
                    <DecisionPanel decision={decision} claimedAmount={submittedClaim.claim_amount} claimId={decision.claim_id} />
                    {activeCaseIdx !== null && (
                      <div className={`rounded-xl border p-3 text-sm font-medium flex items-center gap-2 ${decision.decision === TEST_CASES[activeCaseIdx].expected_decision ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        {decision.decision === TEST_CASES[activeCaseIdx].expected_decision
                          ? <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Matches expected: {TEST_CASES[activeCaseIdx].expected_decision}</>
                          : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Expected {TEST_CASES[activeCaseIdx].expected_decision}, got {decision.decision}</>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-300">
                    <svg className="w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <p className="text-sm">Upload a document or fill the form<br />to get an instant AI decision</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div>
              <h2 className="text-base font-semibold text-gray-700 mb-4">My Claims</h2>
              {histLoading ? (
                <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />)}</div>
              ) : history.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">No claims submitted yet.</div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Claim ID', 'Member', 'Date', 'Claimed', 'Approved', 'Status', 'Submitted'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((rec, i) => (
                        <tr key={rec.id} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">{rec.id.slice(0, 20)}</td>
                          <td className="px-4 py-3 font-medium text-gray-700">{rec.claim.member_name}</td>
                          <td className="px-4 py-3 text-gray-500">{rec.claim.treatment_date}</td>
                          <td className="px-4 py-3 text-gray-700">₹{rec.claim.claim_amount.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 font-semibold text-gray-700">₹{rec.decision.approved_amount.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[rec.decision.decision]}`}>
                              {rec.decision.decision.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {rec.submittedAt instanceof Date ? rec.submittedAt.toLocaleTimeString() : String(rec.submittedAt).slice(11, 19)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
