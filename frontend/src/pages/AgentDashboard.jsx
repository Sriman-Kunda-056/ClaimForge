import { useEffect, useState } from 'react';
import { getAiLogs, getStats } from '../api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import EvalRunner from '../components/EvalRunner';


function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${log.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${log.status === 'error' ? 'bg-red-500' : 'bg-green-500'}`} />

        {/* Type badge */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${log.call_type === 'extraction' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
          {log.call_type === 'extraction' ? '🔍 Extraction' : '✍️ Explanation'}
        </span>

        {/* Model */}
        <span className="text-xs font-mono text-gray-400 shrink-0 hidden sm:block">
          {log.model.split('/').pop()}
        </span>

        {/* Tokens */}
        <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="font-mono">{(log.prompt_tokens + log.completion_tokens).toLocaleString()} tok</span>
          <span className="text-gray-300">|</span>
          <span className="font-mono text-gray-400">{log.prompt_tokens}↑ {log.completion_tokens}↓</span>
        </div>

        {/* Latency */}
        <span className={`text-xs font-mono shrink-0 ${log.latency_ms > 3000 ? 'text-amber-600' : 'text-gray-500'}`}>
          {log.latency_ms}ms
        </span>

        {/* Time */}
        <span className="text-xs text-gray-300 ml-auto shrink-0 hidden md:block">
          {new Date(log.created_at).toLocaleTimeString()}
        </span>

        {/* Expand arrow */}
        <svg className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
          <div className="grid sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: 'Model', value: log.model },
              { label: 'Prompt Tokens', value: log.prompt_tokens.toLocaleString() },
              { label: 'Completion Tokens', value: log.completion_tokens.toLocaleString() },
              { label: 'Latency', value: `${log.latency_ms}ms` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400 mb-0.5">{label}</p>
                <p className="font-mono font-semibold text-gray-700">{value}</p>
              </div>
            ))}
          </div>

          {log.error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-600 mb-1">Error</p>
              <p className="text-xs font-mono text-red-700">{log.error}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Input (prompt preview)</p>
                <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                  {log.prompt_preview || '—'}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Output (LLM response)</p>
                <pre className="text-xs bg-gray-900 text-blue-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                  {log.response_preview || '(no response)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadLogs = () => {
    Promise.all([getAiLogs(token, 200), getStats(token)])
      .then(([l]) => setLogs(l))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadLogs(); }, [token]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadLogs, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, token]);

  const filtered = filterType === 'all' ? logs : logs.filter(l => l.call_type === filterType);
  const totalTokens = logs.reduce((s, l) => s + l.prompt_tokens + l.completion_tokens, 0);
  const avgLatency = logs.length ? Math.round(logs.reduce((s, l) => s + l.latency_ms, 0) / logs.length) : 0;
  const errorCount = logs.filter(l => l.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar
        tabs={[{ key: 'logs', label: `AI Activity Log (${logs.length})` }, { key: 'eval', label: 'Evaluation' }]}
        activeTab={tab}
        onTabChange={k => setTab(k)}
      />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 space-y-5">
        {tab === 'eval' && <EvalRunner />}

        {tab === 'logs' && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total AI Calls', value: String(logs.length), color: 'text-indigo-600' },
                { label: 'Total Tokens', value: totalTokens.toLocaleString(), color: 'text-blue-600' },
                { label: 'Avg Latency', value: `${avgLatency}ms`, color: avgLatency > 3000 ? 'text-amber-600' : 'text-green-600' },
                { label: 'Errors', value: String(errorCount), color: errorCount > 0 ? 'text-red-600' : 'text-gray-500' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Token breakdown */}
            {logs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Token Usage by Type</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: 'Extraction calls', count: logs.filter(l => l.call_type === 'extraction').length, tokens: logs.filter(l => l.call_type === 'extraction').reduce((s,l) => s + l.prompt_tokens + l.completion_tokens, 0), color: 'bg-blue-500' },
                    { label: 'Explanation calls', count: logs.filter(l => l.call_type === 'explanation').length, tokens: logs.filter(l => l.call_type === 'explanation').reduce((s,l) => s + l.prompt_tokens + l.completion_tokens, 0), color: 'bg-purple-500' },
                  ].map(t => (
                    <div key={t.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">{t.label} <span className="text-gray-400">({t.count} calls)</span></span>
                        <span className="font-mono font-semibold">{t.tokens.toLocaleString()} tokens</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${t.color}`} style={{ width: totalTokens ? `${(t.tokens / totalTokens) * 100}%` : '0%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2">
                {['all', 'extraction', 'explanation'].map(f => (
                  <button key={f} onClick={() => setFilterType(f)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
                      ${filterType === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    {f === 'all' ? 'All Calls' : f === 'extraction' ? '🔍 Extraction' : '✍️ Explanation'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => setAutoRefresh(v => !v)}
                    className={`relative w-8 h-4 rounded-full transition-colors ${autoRefresh ? 'bg-green-500' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${autoRefresh ? 'translate-x-4' : ''}`} />
                  </button>
                  Auto-refresh (3s)
                </label>
                <button onClick={loadLogs} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50">
                  ↻ Refresh
                </button>
              </div>
            </div>

            {/* Log entries */}
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-white rounded-xl border border-gray-100 animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center text-gray-300">
                <svg className="w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">No AI calls yet. Submit a claim to see LLM activity here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(log => <LogRow key={log.id} log={log} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
