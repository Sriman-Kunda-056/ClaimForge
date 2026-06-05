import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('opd_user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('opd_token'))

  function login(u, t) {
    setUser(u); setToken(t)
    localStorage.setItem('opd_user', JSON.stringify(u))
    localStorage.setItem('opd_token', t)
  }

  function logout() {
    setUser(null); setToken(null)
    localStorage.removeItem('opd_user')
    localStorage.removeItem('opd_token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
