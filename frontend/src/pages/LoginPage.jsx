import { useState } from 'react';
import { loginApi } from '../api';
import { useAuth } from '../context/AuthContext';

const DEMO_CREDS = [
  { username: 'employee', password: 'demo123',  role: 'Employee',  desc: 'Submit claims, view own history',    icon: '👤' },
  { username: 'reviewer', password: 'demo123',  role: 'Reviewer',  desc: 'Review & override decisions',        icon: '🔍' },
  { username: 'admin',    password: 'admin123', role: 'Admin',     desc: 'Full access + policy management',    icon: '⚙️' },
  { username: 'ai_agent', password: 'agent123', role: 'AI Agent',  desc: 'Batch evaluation & accuracy metrics', icon: '🤖' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await loginApi(username, password);
      login(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(u, p) {
    setUsername(u);
    setPassword(p);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ClaimForge</h1>
          <p className="text-gray-500 text-sm">Insurance Claims Management System</p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-700">Sign in to your account</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="employee / reviewer / admin / ai_agent"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Demo accounts — click to fill</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_CREDS.map(c => (
              <button
                key={c.username}
                type="button"
                onClick={() => quickLogin(c.username, c.password)}
                className={`text-left rounded-xl border p-3 transition-all hover:border-blue-300 hover:bg-blue-50
                  ${username === c.username ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-base">{c.icon}</span>
                  <span className="text-xs font-semibold text-gray-700">{c.role}</span>
                </div>
                <p className="text-xs text-gray-400 leading-tight">{c.desc}</p>
                <p className="text-xs font-mono text-gray-300 mt-1">{c.username} / {c.password}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
