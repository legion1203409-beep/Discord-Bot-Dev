/**
 * Ce citește și ce trimite pagina Cazuri și audit: lista cazurilor pe pagini,
 * un caz cu notele și contestația lui, jurnalul de audit, acțiunile de
 * verificat și numele membrilor. Fiecare cerere ține de serverul ales; un
 * răspuns venit după ce ai schimbat serverul sau filtrele e ignorat.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetchWithMeta } from "../../../hooks/use-moderation-api";
import type { ModerationAuditLog } from "../../../lib/moderation-audit";
import { AUDIT_PAGE_SIZE } from "../../../lib/moderation-audit";
import { CASE_PAGE_SIZE, type CaseDetails, type CaseStatus, type LedgerAction, type ModerationCase } from "./records-model";

async function get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  return (await apiFetchWithMeta<T>(endpoint, { signal })).data;
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 403) return "Nu ai acces la această parte. Accesul se dă la Setări bot → Acces staff.";
  return error instanceof Error && error.message ? error.message : fallback;
}

/** One request per key; a new key (server, filters, page) cancels the one before. */
function useLoad<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: unknown; loading: boolean }>({
    key: null, data: undefined, error: null, loading: Boolean(key),
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  const request = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const run = useCallback(async (keepData: boolean) => {
    const id = ++request.current;
    controllerRef.current?.abort();
    if (!key) {
      setState({ key: null, data: undefined, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ key, data: keepData || current.key === key ? current.data : undefined, error: null, loading: true }));
    try {
      const data = await loadRef.current(controller.signal);
      if (id === request.current) setState({ key, data, error: null, loading: false });
    } catch (error) {
      if (id === request.current) setState((current) => ({ ...current, key, error, loading: false }));
    }
  }, [key]);
  useEffect(() => {
    void run(false);
    return () => { request.current += 1; controllerRef.current?.abort(); };
  }, [run]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : null,
    loading: state.loading || state.key !== key,
    reload: () => run(true),
  };
}

/* ------------------------------------------------------------------ */
/* Cazuri                                                              */
/* ------------------------------------------------------------------ */

export type CaseFilters = { status: CaseStatus | "all"; userId: string | null; actionType: string };
type CasePage = { items: ModerationCase[]; counts?: { open: number; closed: number } };

function caseQuery(filters: CaseFilters, offset: number, limit = CASE_PAGE_SIZE): string {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.status !== "all") query.set("status", filters.status);
  if (filters.userId) query.set("userId", filters.userId);
  if (filters.actionType !== "all") query.set("actionType", filters.actionType);
  return query.toString();
}

/** The case list, page by page; "load more" adds the next page under the ones already shown. */
export function useCaseList(guildId: string | null, filters: CaseFilters) {
  const key = guildId ? `${guildId}|${filters.status}|${filters.userId ?? ""}|${filters.actionType}` : null;
  const first = useLoad<CasePage>(key, (signal) => get<CasePage>(`/guilds/${guildId}/cases?${caseQuery(filters, 0)}`, signal));
  const [more, setMore] = useState<{ key: string | null; items: ModerationCase[]; ended: boolean }>({ key: null, items: [], ended: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [patched, setPatched] = useState<Record<string, ModerationCase>>({});
  useEffect(() => { setMore({ key, items: [], ended: false }); setMoreError(null); setPatched({}); }, [key]);

  const base = first.data?.items ?? [];
  const extra = more.key === key ? more.items : [];
  const items = [...base, ...extra.filter((item) => !base.some((other) => other.id === item.id))]
    .map((item) => patched[item.id] ?? item);
  const hasMore = Boolean(first.data) && !(more.key === key && more.ended) && (extra.length ? extra.length % CASE_PAGE_SIZE === 0 : base.length === CASE_PAGE_SIZE);

  const loadMore = async () => {
    if (!guildId || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    const requestKey = key;
    try {
      const page = await get<CasePage>(`/guilds/${guildId}/cases?${caseQuery(filters, items.length)}`);
      setMore((current) => current.key !== requestKey ? current : {
        key: requestKey, items: [...current.items, ...page.items], ended: page.items.length < CASE_PAGE_SIZE,
      });
    } catch (error) {
      setMoreError(error);
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    items,
    counts: first.data?.counts,
    loading: first.loading && !first.data,
    refreshing: first.loading && Boolean(first.data),
    error: first.error ?? moreError,
    hasMore,
    loadingMore,
    loadMore,
    reload: () => { setMore({ key, items: [], ended: false }); setPatched({}); return first.reload(); },
    /** Shows a case's new state in the list without loading the list again. */
    patch: (item: ModerationCase) => setPatched((current) => ({ ...current, [item.id]: item })),
  };
}

/** The open and closed counts of the whole server, for the menu and the head of the page. */
export function useCaseCounts(guildId: string | null, refreshKey = 0) {
  const loaded = useLoad<CasePage>(guildId ? `${guildId}|counts|${refreshKey}` : null, (signal) => get<CasePage>(`/guilds/${guildId}/cases?limit=1&offset=0`, signal));
  return loaded.data?.counts;
}

export function useCaseDetails(guildId: string | null, caseId: string | null) {
  const loaded = useLoad<CaseDetails>(guildId && caseId ? `${guildId}|${caseId}` : null, (signal) => get<CaseDetails>(`/guilds/${guildId}/cases/${caseId}`, signal));
  return loaded;
}

export async function updateCase(guildId: string, caseId: string, change: { status?: CaseStatus; reason?: string }): Promise<ModerationCase> {
  return (await apiFetchWithMeta<ModerationCase>(`/guilds/${guildId}/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(change) })).data;
}

export async function addCaseNote(guildId: string, caseId: string, body: string): Promise<void> {
  await apiFetchWithMeta(`/guilds/${guildId}/cases/${caseId}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}

/* ------------------------------------------------------------------ */
/* Jurnalul de audit                                                   */
/* ------------------------------------------------------------------ */

export type AuditFilters = { search: string; category: string; start: string; end: string; page: number };

export function useAuditPage(guildId: string | null, filters: AuditFilters, valid: boolean) {
  const search = filters.search.trim();
  const key = guildId && valid ? `${guildId}|${search}|${filters.category}|${filters.start}|${filters.end}|${filters.page}` : null;
  return useLoad<{ items: ModerationAuditLog[]; total: number }>(key, (signal) => {
    const query = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(filters.page * AUDIT_PAGE_SIZE) });
    if (search) query.set("search", search);
    if (filters.category !== "all") query.set("category", filters.category);
    if (filters.start) query.set("start", new Date(filters.start).toISOString());
    if (filters.end) query.set("end", new Date(filters.end).toISOString());
    return get(`/guilds/${guildId}/logs/audit?${query}`, signal);
  });
}

/** Actions Discord did not confirm: waiting for an answer, or uncertain. */
export function useLedger(guildId: string | null, refreshKey = 0) {
  return useLoad<LedgerAction[]>(guildId ? `${guildId}|ledger|${refreshKey}` : null, async (signal) => {
    const [pending, uncertain] = await Promise.all([
      get<{ items: LedgerAction[] }>(`/guilds/${guildId}/actions?status=pending&limit=50`, signal),
      get<{ items: LedgerAction[] }>(`/guilds/${guildId}/actions?status=uncertain&limit=50`, signal),
    ]);
    return [...pending.items, ...uncertain.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });
}

export async function reconcileAction(guildId: string, actionId: string, status: "applied" | "failed", note: string): Promise<void> {
  await apiFetchWithMeta(`/guilds/${guildId}/actions/${actionId}/reconcile`, { method: "PATCH", body: JSON.stringify({ status, note }) });
}

/* ------------------------------------------------------------------ */
/* Numele membrilor                                                    */
/* ------------------------------------------------------------------ */

export type Person = { id: string; name: string; username: string | null; avatarUrl: string; inGuild: boolean; bot: boolean };

// Shared by both lists for the whole visit; an ID the server did not know stays unknown.
const people = new Map<string, Person | null>();
const inFlight = new Set<string>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 60_000;

/** Names and pictures for the IDs on screen; the lists show the ID until the name arrives. */
export function usePeople(guildId: string | null, ids: readonly string[]): (id: string | null | undefined) => Person | null {
  const [, setVersion] = useState(0);
  // A later render may drop the IDs already asked for; the answer must still redraw the list.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const now = Date.now();
  const wanted = guildId ? ids.filter((id) => {
    const key = `${guildId}:${id}`;
    if (people.has(key) || inFlight.has(key)) return false;
    const failed = failedAt.get(key);
    return !failed || now - failed > RETRY_AFTER_MS;
  }) : [];
  const wantedKey = wanted.join(",");
  useEffect(() => {
    if (!guildId || !wanted.length) return;
    for (const id of wanted) inFlight.add(`${guildId}:${id}`);
    const chunks: string[][] = [];
    for (let index = 0; index < wanted.length; index += 50) chunks.push(wanted.slice(index, index + 50));
    void Promise.all(chunks.map(async (chunk) => {
      try {
        const result = await get<{ people: Person[] }>(`/guilds/${guildId}/people?ids=${chunk.join(",")}`);
        for (const id of chunk) people.set(`${guildId}:${id}`, result.people.find((person) => person.id === id) ?? null);
      } catch {
        // Names are a nicety: on an error the list keeps showing IDs and asks again a minute later.
        for (const id of chunk) failedAt.set(`${guildId}:${id}`, Date.now());
      } finally {
        for (const id of chunk) inFlight.delete(`${guildId}:${id}`);
      }
    })).then(() => { if (mounted.current) setVersion((value) => value + 1); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, wantedKey]);
  return (id) => (guildId && id ? people.get(`${guildId}:${id}`) ?? null : null);
}
