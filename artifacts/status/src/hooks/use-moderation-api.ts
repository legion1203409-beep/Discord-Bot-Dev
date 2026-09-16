import { useState, useEffect, useCallback, useRef } from "react";

const BASE_URL = "/api/moderation";

export interface ModerationSession {
  authenticated: boolean;
  userId?: string;
  guilds?: Array<{ id: string; name: string; icon: string | null }>;
  csrfToken?: string;
  expiresAt?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Global state for session
let cachedSession: ModerationSession | null = null;
let sessionListeners: Array<() => void> = [];

function notifySession() {
  sessionListeners.forEach(fn => fn());
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (cachedSession?.csrfToken && !['GET', 'HEAD'].includes(options.method || 'GET')) {
    headers.set("x-csrf-token", cachedSession.csrfToken);
  }
  headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (err: any) {
    // Network errors (e.g. 502)
    throw new ApiError(0, err.message || "Network Error");
  }

  if (!res.ok) {
    let errorMsg = res.statusText;
    try {
      const err = await res.json();
      errorMsg = err.error || err.message || errorMsg;
    } catch {}
    throw new ApiError(res.status, errorMsg);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function useSession() {
  const [session, setSession] = useState<ModerationSession | null>(cachedSession);
  const [loading, setLoading] = useState(!cachedSession);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<ModerationSession>("/session");
      cachedSession = data;
      setSession(data);
      notifySession();
    } catch (e: any) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        const unauth = { authenticated: false };
        cachedSession = unauth;
        setSession(unauth);
      } else {
        // Don't auto-logout on 502/network errors
        setError(e instanceof ApiError ? e : new ApiError(0, "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cachedSession) fetchSession();
    const handler = () => setSession(cachedSession);
    sessionListeners.push(handler);
    return () => { sessionListeners = sessionListeners.filter(f => f !== handler); };
  }, [fetchSession]);

  const login = async (code: string) => {
    const data = await apiFetch<ModerationSession>("/login", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    cachedSession = { ...data, authenticated: true };
    setSession(cachedSession);
    notifySession();
  };

  const logout = async () => {
    try { await apiFetch("/logout", { method: "POST" }); } catch {}
    cachedSession = { authenticated: false };
    setSession(cachedSession);
    notifySession();
  };

  return { session, loading, error, login, logout, retry: fetchSession };
}

export function useActiveGuild() {
  const { session } = useSession();
  const [guildId, setGuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!guildId && session?.guilds?.length) {
      setGuildId(session.guilds[0].id);
    }
  }, [session, guildId]);

  return { guildId, setGuildId, guilds: session?.guilds || [] };
}

export function useModerationConfig(guildId: string | null) {
  const [data, setData] = useState<any>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/guilds/${guildId}/config`);
      setData(res.config);
      setVersion(res.version.toString());
      setError(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const update = async (newData: any) => {
    if (!guildId) return;
    if (!version) throw new Error("Missing config version");
    try {
      const res = await apiFetch<any>(`/guilds/${guildId}/config`, {
        method: "PUT",
        headers: { "If-Match": version },
        body: JSON.stringify(newData),
      });
      setData(res.config);
      setVersion(res.version.toString());
      return res;
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        throw new Error("Conflict de versiune: altcineva a modificat setările între timp. Te rugăm să reîmprospătezi pagina.");
      } else if (e instanceof ApiError && e.status === 428) {
        throw new Error("Eroare de sistem: lipsește versiunea configurației (If-Match).");
      }
      throw e;
    }
  };

  return { data, version, loading, error, update, refetch: fetchConfig };
}

export function useCases(guildId: string | null, params?: { status?: string, userId?: string, limit?: number, offset?: number }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCases = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.userId) query.set("userId", params.userId);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    
    try {
      const res = await apiFetch<any>(`/guilds/${guildId}/cases?${query}`);
      setData(res.items || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [guildId, params?.status, params?.userId, params?.limit, params?.offset]);

  useEffect(() => { fetchCases(); }, [fetchCases]);
  return { data, loading, refetch: fetchCases };
}

export function useAuditLogs(guildId: string | null) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/guilds/${guildId}/logs/audit`);
      setData(res.items || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  return { data, loading, refetch: fetchLogs };
}

export function useManualAction(guildId: string | null) {
  // Use a ref to persist the key across re-renders for the same intention
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const resetKey = useCallback(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  const execute = async (payload: { type: string, targetId?: string, reason?: string, durationMinutes?: number, channelId?: string, roleId?: string, nickname?: string, amount?: number }) => {
    if (!guildId) throw new Error("No guild selected");
    try {
      const res = await apiFetch(`/guilds/${guildId}/actions`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKeyRef.current
        },
        body: JSON.stringify(payload)
      });
      // After success, prepare a new key for the next distinct action
      resetKey();
      return res;
    } catch (e: any) {
      // If 409 conflict, we don't necessarily reset if it's the exact same intent retry
      // but standard approach is to let the user retry with the same key.
      throw e;
    }
  };

  return { execute, resetKey };
}

export function useCaseDetails(guildId: string | null, caseId: string | null) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!caseId || !guildId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/guilds/${guildId}/cases/${caseId}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [guildId, caseId]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const updateCase = async (newData: any) => {
    if (!caseId || !guildId) return;
    await apiFetch<any>(`/guilds/${guildId}/cases/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(newData)
    });
    await fetchDetails();
  };

  const addNote = async (text: string) => {
    if (!caseId || !guildId) return;
    await apiFetch<any>(`/guilds/${guildId}/cases/${caseId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: text })
    });
    await fetchDetails();
  };

  return { data, loading, refetch: fetchDetails, updateCase, addNote };
}

export function useActionLedger(guildId: string | null, params?: { status?: string, limit?: number, offset?: number }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchActions = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    
    try {
      const res = await apiFetch<any>(`/guilds/${guildId}/actions?${query}`);
      setData(res.items || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [guildId, params?.status, params?.limit, params?.offset]);

  useEffect(() => { fetchActions(); }, [fetchActions]);
  return { data, loading, refetch: fetchActions };
}

export function useReconcileAction(guildId: string | null) {
  return async (actionId: string, status: "applied" | "failed" | "uncertain", note: string) => {
    if (!guildId) throw new Error("No guild selected");
    return apiFetch(`/guilds/${guildId}/actions/${actionId}/reconcile`, {
      method: "PATCH",
      body: JSON.stringify({ status, note })
    });
  };
}
