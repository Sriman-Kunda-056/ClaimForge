import type { Claim, Decision } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

function authHeaders(token?: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginApi(username: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

export async function adjudicate(claim: Claim, token?: string | null): Promise<Decision> {
  const res = await fetch(`${BASE}/adjudicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(claim),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function extractDocument(file: File, token?: string | null): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/extract`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Extraction failed' }));
    throw new Error(err.detail || 'Extraction failed');
  }
  return res.json();
}

export async function getPolicy(token?: string | null): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/policy`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getClaims(token?: string | null): Promise<unknown[]> {
  const res = await fetch(`${BASE}/claims`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePolicy(data: Record<string, unknown>, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getStats(token?: string | null): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/stats`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAiLogs(token?: string | null, limit = 100): Promise<unknown[]> {
  const res = await fetch(`${BASE}/ai-logs?limit=${limit}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function submitAppeal(claimId: string, message: string, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/claims/${claimId}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function replyToAppeal(claimId: string, message: string, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/claims/${claimId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getClaimThread(claimId: string, token?: string | null): Promise<unknown[]> {
  const res = await fetch(`${BASE}/claims/${claimId}/thread`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function overrideClaim(
  claimId: string,
  action: 'APPROVED' | 'REJECTED',
  reason: string,
  token?: string | null,
): Promise<void> {
  const res = await fetch(`${BASE}/claims/${claimId}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) throw new Error(await res.text());
}
