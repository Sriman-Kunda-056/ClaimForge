import type { ClaimRecord, DecisionType } from '../types';

const BADGE: Record<DecisionType, string> = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700',
};

interface Props {
  history: ClaimRecord[];
  onSelect: (record: ClaimRecord) => void;
  selectedId: string | null;
  loading?: boolean;
}

export default function ClaimsHistory({ history, onSelect, selectedId, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-gray-100 p-3 bg-white animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
            <div className="h-2 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No claims yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((rec) => (
        <button
          key={rec.id}
          onClick={() => onSelect(rec)}
          className={`w-full text-left rounded-xl border p-3 transition-all hover:border-blue-300
            ${selectedId === rec.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-gray-700 truncate">{rec.claim.member_name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${BADGE[rec.decision.decision]}`}>
              {rec.decision.decision.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>₹{rec.claim.claim_amount.toLocaleString('en-IN')}</span>
            <span>{rec.submittedAt instanceof Date ? rec.submittedAt.toLocaleTimeString() : String(rec.submittedAt).slice(11, 19)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
