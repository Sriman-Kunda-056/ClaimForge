import { useAuth } from '../context/AuthContext'

const ROLE_BADGE = {
  employee: 'bg-blue-100 text-blue-700',
  reviewer: 'bg-purple-100 text-purple-700',
  admin: 'bg-red-100 text-red-700',
  ai_agent: 'bg-indigo-100 text-indigo-700',
}

const ROLE_LABEL = {
  employee: 'Employee', reviewer: 'Reviewer', admin: 'Admin', ai_agent: 'AI Agent',
}

export default function Navbar({ tabs, activeTab, onTabChange }) {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="font-semibold text-gray-800 hidden sm:block">ClaimForge</span>
        </div>
        {tabs && onTabChange && (
          <nav className="flex items-center gap-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => onTabChange(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${activeTab === t.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-gray-700">{user.name}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role]}`}>
              {ROLE_LABEL[user.role]}
            </span>
          </div>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 transition-colors border border-gray-200 rounded-lg px-3 py-1.5">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
