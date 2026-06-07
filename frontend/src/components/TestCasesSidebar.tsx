import { TEST_CASES } from '../testCases';
import type { DecisionType } from '../types';

const BADGE: Record<DecisionType, string> = {
  APPROVED:      'bg-green-100 text-green-700',
  REJECTED:      'bg-red-100 text-red-700',
  PARTIAL:       'bg-amber-100 text-amber-700',
  MANUAL_REVIEW: 'bg-orange-100 text-orange-700',
};

interface Props {
  onLoad: (idx: number) => void;
  activeIdx: number | null;
}

export default function TestCasesSidebar({ onLoad, activeIdx }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-3">
        10 Official Test Cases
      </p>
      {TEST_CASES.map((tc, i) => (
        <button
          key={tc.case_id}
          onClick={() => onLoad(i)}
          className={`w-full text-left rounded-xl border p-3 transition-all hover:border-blue-300 hover:shadow-sm
            ${activeIdx === i ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-mono text-gray-400">{tc.case_id}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[tc.expected_decision as DecisionType]}`}>
              {tc.expected_decision.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-700 leading-tight">{tc.case_name}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-tight">{tc.description}</p>
        </button>
      ))}
    </div>
  );
}
