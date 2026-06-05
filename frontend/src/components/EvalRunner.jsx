import { useState } from 'react';
import { adjudicate } from '../api';
import { useAuth } from '../context/AuthContext';
import { TEST_CASES } from '../testCases';

const BADGE = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700',
};

export default function EvalRunner() {
  const { token } = useAuth();
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  async function runAll() {
    setRunning(true);
    setResults([]);
    setProgress(0);

    // Use a unique run ID so eval submissions never accumulate in real DB history.
    // Without this, EMP001 on 2024-11-01 builds up ≥2 same-day claims across runs
    // and triggers the fraud rule, flipping APPROVED → MANUAL_REVIEW.
    const runId = `EVAL_${Date.now()}`;

    const all = [];
    for (let i = 0; i < TEST_CASES.length; i++) {
      const tc = TEST_CASES[i];
      const t0 = Date.now();
      // Isolate each eval run with a unique member_id prefix
      const claim = { ...tc.claim, member_id: `${runId}_${tc.claim.member_id}` };
      let decision = null;
      try {
        decision = await adjudicate(claim, token);
      } catch { /* network/server error — treat as null decision */ }
      all.push({
        case_id: tc.case_id,
        case_name: tc.case_name,
        expected: tc.expected_decision,
        got: decision?.decision ?? 'REJECTED',
        match: decision?.decision === tc.expected_decision,
        approved_amount: decision?.approved_amount ?? 0,
        confidence: decision?.confidence_score ?? 0,
        duration_ms: Date.now() - t0,
      });
      setProgress(i + 1);
      setResults([...all]);
    }
    setRunning(false);
  }

  const total = results.length;
  const passed = results.filter(r => r.match).length;
  const accuracy = total ? Math.round((passed / total) * 100) : 0;
  const avgConf = total ? Math.round(results.reduce((s, r) => s + r.confidence, 0) / total * 100) : 0;
  const avgMs = total ? Math.round(results.reduce((s, r) => s + r.duration_ms, 0) / total) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">Evaluation Runner</h2>
          <p className="text-xs text-gray-400">Runs all 10 official test cases and measures accuracy</p>
        </div>
        <button
          onClick={runAll}
          disabled={running}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors flex items-center gap-2"
        >
          {running ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              Running {progress}/{TEST_CASES.length}…
            </>
          ) : 'Run All Test Cases'}
        </button>
      </div>

      {/* Progress bar */}
      {running && (
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${(progress / TEST_CASES.length) * 100}%` }}
          />
        </div>
      )}

      {/* Summary metrics */}
      {total > 0 && !running && (
        <div className="grid grid-cols-4 gap-3">
          <MetricCard label="Accuracy" value={`${accuracy}%`} sub={`${passed}/${total} passed`} color={accuracy === 100 ? 'text-green-600' : accuracy >= 80 ? 'text-amber-600' : 'text-red-600'} />
          <MetricCard label="Avg Confidence" value={`${avgConf}%`} sub="across all cases" color="text-blue-600" />
          <MetricCard label="Avg Latency" value={`${avgMs}ms`} sub="per decision" color="text-gray-700" />
          <MetricCard label="Total Cases" value={String(total)} sub={`${TEST_CASES.length} official`} color="text-gray-700" />
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Case</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expected</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Got</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Approved</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ms</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pass</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.case_id} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{r.case_id}</td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-[160px] truncate">{r.case_name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[r.expected]}`}>
                      {r.expected.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[r.got]}`}>
                      {r.got.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">
                    {r.approved_amount ? `₹${r.approved_amount.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">
                    {Math.round(r.confidence * 100)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 font-mono text-xs">{r.duration_ms}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.match
                      ? <span className="text-green-500">✓</span>
                      : <span className="text-red-400">✗</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!running && results.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-300">
          <svg className="w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Click "Run All Test Cases" to evaluate accuracy</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
