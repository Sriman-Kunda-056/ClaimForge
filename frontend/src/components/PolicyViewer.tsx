import { useEffect, useState } from 'react';
import { getPolicy } from '../api';

function pretty(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function ValueNode({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  if (typeof value === 'boolean') return <span className={value ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-blue-600 font-mono font-medium">{typeof value === 'number' && value > 100 ? '₹' + value.toLocaleString('en-IN') : value}</span>;
  if (typeof value === 'string') return <span className="text-gray-700">{value}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc list-inside space-y-0.5">
        {value.map((v, i) => <li key={i} className="text-gray-600 text-sm">{String(v)}</li>)}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return (
      <div className="pl-3 border-l-2 border-gray-100 space-y-1.5 mt-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex gap-3 text-sm">
            <span className="text-gray-400 shrink-0 w-40">{pretty(k)}</span>
            <ValueNode value={v} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export default function PolicyViewer() {
  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getPolicy().then(setPolicy).catch(e => setErr(e.message));
  }, []);

  if (err) return <p className="text-red-500 text-sm p-4">{err}</p>;
  if (!policy) return <p className="text-gray-400 text-sm p-4">Loading policy…</p>;

  const sections = Object.entries(policy).filter(([k]) => k !== 'policy_id' && k !== 'version');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">{String(policy.policy_id ?? '')}</span>
        <span className="text-xs text-gray-400">v{String(policy.version ?? '')}</span>
      </div>
      {sections.map(([section, value]) => (
        <div key={section} className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-600 mb-3">{pretty(section)}</h4>
          <ValueNode value={value} />
        </div>
      ))}
    </div>
  );
}
