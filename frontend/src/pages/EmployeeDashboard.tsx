import { useEffect, useRef, useState } from 'react';
import { adjudicate, getClaims } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Claim, ClaimRecord, Decision, DecisionType } from '../types';
import Navbar from '../components/Navbar';
import DocumentUpload from '../components/DocumentUpload';
import ClaimForm from '../components/ClaimForm';
import DecisionPanel from '../components/DecisionPanel';
import TestCasesSidebar from '../components/TestCasesSidebar';
import { TEST_CASES } from '../testCases';

const STATUS_BADGE: Record<DecisionType, string> = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700',
};

export default function EmployeeDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState<'submit' | 'history'>('submit');

  const [formKey, setFormKey] = useState(0);
  const [formValues, setFormValues] = useState<Partial<Claim>>({});
  const [extractedFields, setExtractedFields] = useState<Record<string, unknown> | null>(null);
  const [activeCaseIdx, setActiveCaseIdx] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [submittedClaim, setSubmittedClaim] = useState<Claim | null>(null);

  const [history, setHistory] = useState<ClaimRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistLoading(true);
    getClaims(token)
      .then(rows => setHistory((rows as { claim_id: string; claim_json: Claim; decision_json: Decision; submitted_at: string }[]).map(r => ({
        id: r.claim_id, submittedAt: new Date(r.submitted_at), claim: r.claim_json, decision: r.decision_json,
      }))))
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [token]);

  function loadTestCase(idx: number) {
    setActiveCaseIdx(idx);
    setFormValues(TEST_CASES[idx].claim);
    setExtractedFields(null);
    setFormKey(k => k + 1);
    setDecision(null);
    setError('');
    setTab('submit');
  }

  async function handleSubmit(claim: Claim) {
    setLoading(true); setError(''); setDecision(null);
    try {
      const result = await adjudicate(claim, token);
      const rec: ClaimRecord = { id: result.claim_id, submittedAt: new Date(), claim, decision: result };
      setDecision(result); setSubmittedClaim(claim);
      setHistory(h => [rec, ...h]);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar
        tabs={[{ key: 'submit', label: 'New Claim' }, { key: 'history', label: `My Claims (${history.length})` }]}
        activeTab={tab}
        onTabChange={k => setTab(k as 'submit' | 'history')}
      />

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-4 py-6 gap-5">
        {/* Left sidebar — test cases */}
        <aside className="w-64 shrink-0">
          <div className="sticky top-4 max-h-[calc(100vh-5rem)] overflow-y-auto pr-1 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Quick Load Test Cases</p>
            <TestCasesSidebar onLoad={loadTestCase} activeIdx={activeCaseIdx} />
          </div>
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
                <DocumentUpload onExtracted={f => setExtractedFields(f as Record<string, unknown>)} />

                <ClaimForm key={formKey} initialValues={formValues} extractedFields={extractedFields as never} onSubmit={handleSubmit} loading={loading} autoFillUser={activeCaseIdx === null} />
              </div>

              <div ref={resultRef}>
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
                      {history.map((rec, i) => {
                        const presc = rec.claim.prescription as Record<string, unknown> | undefined;
                        const bill = rec.claim.bill as Record<string, number> | undefined;
                        const isOpen = expandedRow === rec.id;
                        return (
                          <>
                            <tr
                              key={rec.id}
                              onClick={() => setExpandedRow(isOpen ? null : rec.id)}
                              className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                            >
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
                            {isOpen && (
                              <tr key={`${rec.id}-detail`} className="bg-blue-50/30">
                                <td colSpan={7} className="px-6 py-4">
                                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                                    {presc && (
                                      <div>
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Prescription</p>
                                        <dl className="space-y-1">
                                          {presc.doctor_name && <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Doctor</dt><dd className="text-gray-700">{String(presc.doctor_name)}</dd></div>}
                                          {presc.doctor_reg && <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Reg No.</dt><dd className="text-gray-700">{String(presc.doctor_reg)}</dd></div>}
                                          {presc.diagnosis && <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Diagnosis</dt><dd className="text-gray-700">{String(presc.diagnosis)}</dd></div>}
                                          {Array.isArray(presc.medicines_prescribed) && presc.medicines_prescribed.length > 0 && (
                                            <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Medicines</dt><dd className="text-gray-700">{(presc.medicines_prescribed as string[]).join(', ')}</dd></div>
                                          )}
                                          {Array.isArray(presc.procedures) && presc.procedures.length > 0 && (
                                            <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Procedures</dt><dd className="text-gray-700">{(presc.procedures as string[]).join(', ')}</dd></div>
                                          )}
                                          {Array.isArray(presc.tests_prescribed) && presc.tests_prescribed.length > 0 && (
                                            <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Tests</dt><dd className="text-gray-700">{(presc.tests_prescribed as string[]).join(', ')}</dd></div>
                                          )}
                                          {presc.treatment && <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Treatment</dt><dd className="text-gray-700">{String(presc.treatment)}</dd></div>}
                                        </dl>
                                      </div>
                                    )}
                                    {bill && Object.keys(bill).length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill Items</p>
                                        <dl className="space-y-1">
                                          {Object.entries(bill).map(([k, v]) => (
                                            <div key={k} className="flex gap-2">
                                              <dt className="text-gray-400 w-28 shrink-0 capitalize">{k.replace(/_/g, ' ')}</dt>
                                              <dd className="text-gray-700 font-medium">₹{Number(v).toLocaleString('en-IN')}</dd>
                                            </div>
                                          ))}
                                        </dl>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Decision Details</p>
                                      <dl className="space-y-1">
                                        <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Confidence</dt><dd className="text-gray-700">{Math.round(rec.decision.confidence_score * 100)}%</dd></div>
                                        {rec.decision.rejection_reasons?.length > 0 && (
                                          <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Reasons</dt><dd className="text-red-600">{rec.decision.rejection_reasons.join(', ')}</dd></div>
                                        )}
                                        {rec.claim.cashless_request && <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Cashless</dt><dd className="text-gray-700">{rec.decision.cashless_approved ? 'Approved' : 'Requested'}</dd></div>}
                                        {rec.claim.hospital && <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Hospital</dt><dd className="text-gray-700">{String(rec.claim.hospital)}</dd></div>}
                                      </dl>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
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
