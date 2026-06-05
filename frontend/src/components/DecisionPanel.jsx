import { useState } from 'react';
import AppealThread from './AppealThread';

const VERDICT_CONFIG = {
  APPROVED:      { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200',  label: 'Approved' },
  REJECTED:      { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200',    label: 'Rejected' },
  PARTIAL:       { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200',  label: 'Partial Approval' },
  MANUAL_REVIEW: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', label: 'Manual Review' },
};

const CONF_COLOR = (score) =>
  score >= 0.9 ? 'bg-green-500' : score >= 0.75 ? 'bg-amber-500' : 'bg-red-500';

function fmt(n) {
  return '₹' + n.toLocaleString('en-IN');
}

function pretty(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DecisionPanel({ decision, claimedAmount, claimId, role, onOverride }) {
  const cfg = VERDICT_CONFIG[decision.decision];
  const pct = Math.round(decision.confidence_score * 100);

  const [showOverride, setShowOverride] = useState(false);
  const [overrideAction, setOverrideAction] = useState('APPROVED');
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  const canOverride = (role === 'reviewer' || role === 'admin') && claimId && onOverride;

  async function submitOverride() {
    if (!claimId || !onOverride || !overrideReason.trim()) return;
    setOverriding(true);
    try {
      await onOverride(claimId, overrideAction, overrideReason);
      setShowOverride(false);
      setOverrideReason('');
    } finally {
      setOverriding(false);
    }
  }

  return (
    <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-6 space-y-5`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className={`inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border} mb-2`}>
            {cfg.label}
          </span>
          {claimId && <p className="text-xs text-gray-500 font-mono">{claimId}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500 mb-1">AI Confidence</p>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full ${CONF_COLOR(decision.confidence_score)} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-sm font-bold ${cfg.text}`}>{pct}%</span>
          </div>
        </div>
      </div>

      {/* Amount summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400 mb-1">Claimed</p>
          <p className="text-base font-semibold text-gray-700">{fmt(claimedAmount)}</p>
        </div>
        {Object.entries(decision.deductions).map(([k, v]) => (
          <div key={k} className="bg-white rounded-lg p-3 border border-gray-100 text-center">
            <p className="text-xs text-gray-400 mb-1">{pretty(k)}</p>
            <p className="text-base font-semibold text-red-500">−{fmt(v)}</p>
          </div>
        ))}
        <div className={`rounded-lg p-3 border ${cfg.border} text-center ${cfg.bg}`}>
          <p className="text-xs text-gray-500 mb-1">Approved</p>
          <p className={`text-base font-bold ${cfg.text}`}>{fmt(decision.approved_amount)}</p>
        </div>
      </div>

      {/* Cashless */}
      {decision.cashless_approved && (
        <div className="flex items-center gap-2 bg-green-100 text-green-700 rounded-lg px-4 py-2 text-sm font-medium border border-green-200">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Cashless settlement approved at network hospital
        </div>
      )}

      {/* Rejection reasons */}
      {decision.rejection_reasons.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rejection Reason</p>
          <ul className="space-y-1">
            {decision.rejection_reasons.map(r => (
              <li key={r} className="flex items-start gap-2 text-sm text-red-700">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                {pretty(r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rejected items */}
      {decision.rejected_items.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Excluded Items</p>
          <ul className="space-y-1">
            {decision.rejected_items.map(item => (
              <li key={item} className="flex items-start gap-2 text-sm text-amber-700">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" /></svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fraud flags */}
      {decision.flags.length > 0 && (
        <div className="bg-orange-100 border border-orange-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Fraud Indicators</p>
          <ul className="space-y-1">
            {decision.flags.map(f => (
              <li key={f} className="text-sm text-orange-800 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" /></svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Fraud Risk */}
      {decision.ai_fraud_risk && (
        <div className={`rounded-lg p-3 border ${
          decision.ai_fraud_risk.risk_level === 'HIGH'   ? 'bg-red-50 border-red-200' :
          decision.ai_fraud_risk.risk_level === 'MEDIUM' ? 'bg-amber-50 border-amber-200' :
          'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-semibold uppercase tracking-wide ${
              decision.ai_fraud_risk.risk_level === 'HIGH'   ? 'text-red-700' :
              decision.ai_fraud_risk.risk_level === 'MEDIUM' ? 'text-amber-700' :
              'text-green-700'
            }`}>
              🤖 AI Fraud Analysis
            </p>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${
                  decision.ai_fraud_risk.risk_level === 'HIGH' ? 'bg-red-500' :
                  decision.ai_fraud_risk.risk_level === 'MEDIUM' ? 'bg-amber-500' : 'bg-green-500'
                }`} style={{ width: `${decision.ai_fraud_risk.risk_score}%` }} />
              </div>
              <span className={`text-xs font-bold ${
                decision.ai_fraud_risk.risk_level === 'HIGH'   ? 'text-red-700' :
                decision.ai_fraud_risk.risk_level === 'MEDIUM' ? 'text-amber-700' :
                'text-green-700'
              }`}>{decision.ai_fraud_risk.risk_level} ({decision.ai_fraud_risk.risk_score}/100)</span>
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2">{decision.ai_fraud_risk.reasoning}</p>
          {decision.ai_fraud_risk.flags.length > 0 && (
            <ul className="space-y-0.5">
              {decision.ai_fraud_risk.flags.map(f => (
                <li key={f} className="text-xs text-gray-600 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Notes */}
      {decision.notes && (
        <div className="border-t border-gray-200 pt-4 space-y-2">
          <p className="text-sm text-gray-700">{decision.notes}</p>
          {decision.next_steps && (
            <p className="text-sm text-gray-500 italic">{decision.next_steps}</p>
          )}
        </div>
      )}

      {/* Reviewer override */}
      {canOverride && (
        <div className="border-t border-gray-200 pt-4">
          {!showOverride ? (
            <button
              onClick={() => setShowOverride(true)}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Override Decision
            </button>
          ) : (
            <div className="space-y-3 bg-purple-50 rounded-lg p-4 border border-purple-100">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Reviewer Override</p>
              <div className="flex gap-2">
                {['APPROVED', 'REJECTED'].map(a => (
                  <button
                    key={a}
                    onClick={() => setOverrideAction(a)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${overrideAction === a
                        ? a === 'APPROVED' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
                rows={2}
                placeholder="Reason for override (required)"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={submitOverride}
                  disabled={overriding || !overrideReason.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {overriding ? 'Saving…' : 'Confirm Override'}
                </button>
                <button
                  onClick={() => { setShowOverride(false); setOverrideReason(''); }}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI full reasoning — visible to reviewer/admin only */}
      {(role === 'reviewer' || role === 'admin') && (
        <div className="border-t border-gray-200 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Decision Reasoning</p>
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs font-mono text-gray-600">
            <div className="flex gap-2">
              <span className="text-gray-400 w-32 shrink-0">Decision</span>
              <span className="font-bold text-gray-800">{decision.decision}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-32 shrink-0">Confidence</span>
              <span>{Math.round(decision.confidence_score * 100)}%</span>
            </div>
            {decision.rejection_reasons.length > 0 && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">Rule code</span>
                <span className="text-red-600">{decision.rejection_reasons.join(', ')}</span>
              </div>
            )}
            {Object.keys(decision.deductions).length > 0 && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">Deductions</span>
                <span>{JSON.stringify(decision.deductions)}</span>
              </div>
            )}
            {decision.ai_fraud_risk && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">AI fraud risk</span>
                <span className={decision.ai_fraud_risk.risk_level === 'HIGH' ? 'text-red-600 font-bold' : decision.ai_fraud_risk.risk_level === 'MEDIUM' ? 'text-amber-600' : 'text-green-600'}>
                  {decision.ai_fraud_risk.risk_level} ({decision.ai_fraud_risk.risk_score}/100)
                </span>
              </div>
            )}
            {decision.ai_fraud_risk?.reasoning && (
              <div className="flex gap-2">
                <span className="text-gray-400 w-32 shrink-0">AI reasoning</span>
                <span className="text-gray-700 font-sans">{decision.ai_fraud_risk.reasoning}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Appeal / review thread */}
      {claimId && (
        <AppealThread claimId={claimId} decisionType={decision.decision} />
      )}
    </div>
  );
}
