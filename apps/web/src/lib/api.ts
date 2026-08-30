export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api/v1';

// ── Auth Token Storage Keys ──────────────────────────────────
// Note: Storing JWT in localStorage has an XSS tradeoff compared to httpOnly cookies;
// for a decoupled single-page application with a separated API origin, localStorage is
// utilized with Bearer header injection, cryptographic verification, and token refresh support.
export const TOKEN_STORAGE_KEY = 'safero_access_token';
export const REFRESH_TOKEN_STORAGE_KEY = 'safero_refresh_token';
export const USER_STORAGE_KEY = 'safero_auth_user';

export function getStoredAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthTokens(accessToken: string, refreshToken?: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }
  } catch (err) {
    console.error('Failed to store tokens in localStorage:', err);
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear auth from localStorage:', err);
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        clearStoredAuth();
        return null;
      }

      const json = await res.json();
      if (json.success && json.data?.access_token) {
        const newAccess = json.data.access_token;
        const newRefresh = json.data.refresh_token;
        setStoredAuthTokens(newAccess, newRefresh);
        return newAccess;
      }
      clearStoredAuth();
      return null;
    } catch {
      clearStoredAuth();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchJson<T>(endpoint: string, options?: RequestInit, retry = true): Promise<T> {
  const token = getStoredAccessToken();
  const headers: Record<string, string> = {
    ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const env = localStorage.getItem('safero_env') || 'live';
  headers['X-Safero-Environment'] = env;

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized by attempting a token refresh
  if (res.status === 401) {
    if (retry) {
      const newToken = await attemptTokenRefresh();
      if (newToken) {
        return fetchJson<T>(endpoint, options, false);
      }
    }
    // Token refresh failed or exhausted -> Session expired
    clearStoredAuth();
    try {
      sessionStorage.setItem('safero_session_expired', 'true');
    } catch {}
    if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login?session_expired=1';
    }
  }

  if (!res.ok) {
    let errorMsg = `API request failed: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error?.message) {
        errorMsg = errJson.error.message;
      } else if (errJson.message) {
        errorMsg = errJson.message;
      }
    } catch {
      // Use fallback errorMsg
    }
    throw new Error(errorMsg);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export const api = {
  // ── Authentication Endpoints ─────────────────────────────────
  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      const msg = json.error?.message || json.message || 'Invalid email or password';
      throw new Error(msg);
    }
    return json.data; // { user, access_token, refresh_token, expires_in }
  },

  register: async (email: string, password: string, fullName: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      const msg = json.error?.message || json.message || 'Registration failed';
      throw new Error(msg);
    }
    return json.data;
  },

  refreshToken: (refreshToken: string) =>
    fetchJson<any>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  logout: () =>
    fetchJson<any>('/auth/logout', {
      method: 'POST',
    }),

  getCurrentUser: () => fetchJson<any>('/auth/me'),

  // ── Platform Endpoints ───────────────────────────────────────
  getSummary: () => fetchJson<any>('/analytics/summary'),
  getVolumeSeries: () => fetchJson<any[]>('/analytics/volume'),
  getModelPerformance: () => fetchJson<any>('/analytics/model-performance'),

  getTransactions: (params?: { page?: number; status?: string; payment_method?: string; is_abuse_ring?: string; search?: string; env?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.append('page', params.page.toString());
    if (params?.status && params.status !== 'All Statuses') q.append('status', params.status);
    if (params?.payment_method && params.payment_method !== 'All Payment Methods') q.append('payment_method', params.payment_method);
    if (params?.is_abuse_ring) q.append('is_abuse_ring', params.is_abuse_ring);
    if (params?.search) q.append('search', params.search);
    if (params?.env) q.append('env', params.env);

    return fetchJson<any>(`/transactions?${q.toString()}`);
  },

  getTransactionDetail: (id: string) => fetchJson<any>(`/transactions/${id}`),
  getClusters: () => fetchJson<any[]>('/graph/clusters'),
  getClusterDetail: (id: string) => fetchJson<any>(`/graph/clusters/${id}`),

  getCases: (status?: string) => {
    const q = status && status !== 'All' ? `?status=${status}` : '';
    return fetchJson<any[]>(`/cases${q}`);
  },

  createCase: (data: any) =>
    fetchJson<any>('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCaseStatus: (id: string, status: string, notes?: string) =>
    fetchJson<any>(`/cases/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    }),

  updateCase: (id: string, data: Record<string, any>) =>
    fetchJson<any>(`/cases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  toggleChecklistItem: (caseId: string, checklistId: string, completed: boolean) =>
    fetchJson<any>(`/cases/${encodeURIComponent(caseId)}/checklist/${encodeURIComponent(checklistId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),

  applyMitigation: (caseId: string, mitigation_type: string, active: boolean) =>
    fetchJson<any>(`/cases/${encodeURIComponent(caseId)}/mitigations`, {
      method: 'POST',
      body: JSON.stringify({ mitigation_type, active }),
    }),

  addCaseNote: (caseId: string, note: string) =>
    fetchJson<any>(`/cases/${encodeURIComponent(caseId)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  deleteCase: (id: string) =>
    fetchJson<any>(`/cases/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  clearCaseAudit: (id: string) =>
    fetchJson<any>(`/cases/${encodeURIComponent(id)}/audit`, {
      method: 'DELETE',
    }),

  unescalateCase: (id: string) =>
    fetchJson<any>(`/cases/${encodeURIComponent(id)}/unescalate`, {
      method: 'POST',
    }),

  rescanGraph: () =>
    fetchJson<any>('/graph/rescan', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  queryInvestigation: (query: string) =>
    fetchJson<any>('/investigations/query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  chatWithAI: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    fetchJson<{ role: string; content: string; usage?: any }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),

  getWebhookHistory: () => fetchJson<any[]>('/webhooks/history'),
};

