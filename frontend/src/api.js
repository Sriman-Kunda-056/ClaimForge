const BASE = '/api'

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function loginApi(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error(err.detail || 'Login failed')
  }
  return res.json()
}

export async function adjudicate(claim, token) {
  const res = await fetch(`${BASE}/adjudicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(claim),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function extractDocument(file, token) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/extract`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Extraction failed' }))
    throw new Error(err.detail || 'Extraction failed')
  }
  return res.json()
}

export async function getPolicy(token) {
  const res = await fetch(`${BASE}/policy`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updatePolicy(data, token) {
  const res = await fetch(`${BASE}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function getClaims(token) {
  const res = await fetch(`${BASE}/claims`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getStats(token) {
  const res = await fetch(`${BASE}/stats`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getAiLogs(token, limit = 100) {
  const res = await fetch(`${BASE}/ai-logs?limit=${limit}`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function submitAppeal(claimId, message, token) {
  const res = await fetch(`${BASE}/claims/${claimId}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function replyToAppeal(claimId, message, token) {
  const res = await fetch(`${BASE}/claims/${claimId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function getClaimThread(claimId, token) {
  const res = await fetch(`${BASE}/claims/${claimId}/thread`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function overrideClaim(claimId, action, reason, token) {
  const res = await fetch(`${BASE}/claims/${claimId}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ action, reason }),
  })
  if (!res.ok) throw new Error(await res.text())
}
