import { useState, useEffect, useCallback, useRef } from "react";
import { withAuthRequestTimeout } from "../lib/auth-request";
import {
  AUDIT_PAGE_SIZE,
  auditDateRangeError,
  type AuditLogQuery,
  type ModerationAuditLog,
} from "../lib/moderation-audit";

const BASE_URL = "/api/moderation";
const ACTIVE_GUILD_STORAGE_KEY = "moderation.activeGuildId";

export interface ModerationSession {
  authenticated: boolean;
  userId?: string;
  isBotOwner?: boolean;
  guilds?: ModerationGuild[];
  csrfToken?: string;
  expiresAt?: string;
}

export interface ModerationGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface ModerationAuthConfig {
  discordOAuthConfigured: boolean;
  authorizationUrl: string;
  botInviteUrl: string | null;
  bot?: {
    name: string;
    avatarUrl: string | null;
  } | null;
}

export interface ModerationRole {
  id: string;
  name: string;
  position?: number;
  managed?: boolean;
  activityRewardAssignable?: boolean;
}

export interface ModerationChannel {
  id: string;
  name: string;
  type: number | string;
  parentId?: string | null;
}

export interface ModerationMetadata {
  guild: { id: string; name: string; ownerId: string };
  roles: ModerationRole[];
  channels: ModerationChannel[];
  emojis: DiscordGuildEmoji[];
  botCapabilities?: {
    online?: boolean;
    messageContent: boolean;
    guildMembers: boolean;
    canManageGuild?: boolean;
    canModerateMembers?: boolean;
    canManageMessages?: boolean;
    canManageChannels?: boolean;
    canManageRoles?: boolean;
    canKickMembers?: boolean;
    canBanMembers?: boolean;
  };
}

export interface DiscordGuildEmoji {
  id: string;
  name: string;
  animated: boolean;
  markup: string;
  url: string;
}

export interface ChannelPermissionConfig {
  roleIds: string[];
  readMessageHistory: boolean;
  sendMessages: boolean;
  rolePermissions?: Record<string, {
    viewChannel: boolean;
    readMessageHistory: boolean;
    sendMessages: boolean;
  }>;
}

export interface BotControlConfig {
  channels: Record<string, string>;
  provisioningPermissions: Record<string, ChannelPermissionConfig>;

  allianceRecruitmentText: string;

  verification: {
    enabled: boolean;
    channelId: string;
    roleId: string;
    title: string;
    message: string;
    buttonLabel: string;
    buttonEmoji: string;
    successMessage: string;
    alreadyVerifiedMessage: string;
    imageUrl: string;
    thumbnailUrl: string;
    panelMessageId: string;
  };

  tickets: {
    categories: {
      staff: string;
      partnership: string;
      help_report: string;
    };
    staffReviewRoleId: string;
    alliancePublicChannelId: string;
    allianceOwnerGuildId: string;
    allianceAnnouncementTemplate: string;
    allianceAnnouncementMode: "text" | "embed";
    allianceAnnouncementImageUrl?: string;
    allianceAnnouncementThumbnailUrl?: string;
    allianceAnnouncementImageMode: "none" | "large" | "thumbnail";
    incompleteTimeoutMinutes: number;
    firstWarningMinutes: number;
    secondWarningMinutes: number;
    flows: {
      staff: TicketFlowConfig;
      partnership: TicketFlowConfig;
      help_report: TicketFlowConfig;
    };
  };

  gameplayConfig: {
    paused: boolean;
    messages: {
      gamePaused: string;
      oraclePaused: string;
      gamePausedImageUrl: string;
      gamePausedThumbnailUrl: string;
      oraclePausedImageUrl: string;
      oraclePausedThumbnailUrl: string;
    };
    memberMessages: {
      welcomeEnabled: boolean;
      leaveEnabled: boolean;
      channelId: string;
      style: "medieval" | "normal" | "fantasy" | "sci_fi" | "humorous" | "custom";
      customStyle: string;
    };
    events: {
      eventDurationMinutes: number;
      eventCooldownMinMinutes: number;
      eventCooldownMaxMinutes: number;
      finalBossDurationMinutes: number;
      standaloneBossIntervalMinMinutes: number;
      standaloneBossIntervalMaxMinutes: number;
      standaloneBossDurationMinutes: number;
      battleEventIntervalMinutes: number;
      chestIntervalMinutes: number;
      chestExpireMinutes: number;
    };
    missions: {
      kill_10: { target: number; rewardQty: number };
      rare_3: { target: number; rewardQty: number };
      boss_1: { target: number; rewardQty: number };
    };
    economy: {
      monsterGoldMultiplier: number;
      monsterXpMultiplier: number;
      bossGoldMultiplier: number;
      bossXpMultiplier: number;
    };
  };
  dailyStats: {
    channelId: string;
    title: string;
    description: string;
    color: string;
    footer: string;
    activityTitle: string;
    channelsTitle: string;
    emptyChannelsText: string;
    imageUrl: string;
    thumbnailUrl: string;
    metricLabels: {
      messages: string;
      uniqueUsers: string;
      boosts: string;
      joins: string;
      leaves: string;
      peakVoice: string;
    };
  };
  inviteTracking: InviteTrackingConfig;
  discordLive?: boolean;
  provisioning?: {
    created: Array<{ key: string; id: string; name: string; type: "text" | "category" }>;
    reused: Array<{ key: string; id: string; name: string; type: "text" | "category" }>;
    verificationPanel?: "not_requested" | "disabled" | "needs_role" | "published" | "failed" | "published_not_saved";
  };
}

export interface InviteTrackingConfig {
  enabled: boolean;
  joinLogChannelId: string;
  reportEnabled: boolean;
  reportChannelId: string;
  reportFrequency: "daily" | "weekly";
  reportTime: string;
  reportWeekday: number;
  reportTimeZone: "Europe/Bucharest" | "Europe/Paris" | "UTC";
  reportTopLimit: number;
}

export type InviteStatsRange = "7" | "30" | "90" | "all";

export interface InviteStatsResponse {
  range: InviteStatsRange;
  startDay: string | null;
  endDay: string;
  totals: {
    attributedJoins: number;
    unknownJoins: number;
  };
  rows: Array<{
    code: string;
    url: string;
    inviterId: string | null;
    inviterName: string | null;
    channelId: string | null;
    totalDiscordUses: number;
    attributedJoins: number;
    maxUses: number | null;
    expiresAt: string | null;
    active: boolean;
    lastSyncedAt: string | null;
  }>;
}

export interface VerifiedMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  joinedAt: string | null;
}

export interface VerifiedMembersResponse {
  guildId: string;
  roleId: string;
  roleName: string | null;
  total: number;
  members: VerifiedMember[];
}

export interface TicketQuestionConfig {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  multiline: boolean;
  required: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
}

export interface TicketFlowConfig {
  mode: "legacy" | "custom";
  title: string;
  startButtonLabel: string;
  panelDescription: string;
  requirementsText: string;
  completionMessage: string;
  staffNotificationMessage: string;
  panelImageUrl?: string;
  panelThumbnailUrl?: string;
  completionImageUrl?: string;
  completionThumbnailUrl?: string;
  staffNotificationImageUrl?: string;
  staffNotificationThumbnailUrl?: string;
  completionAction: "lock" | "notify_staff" | "keep_open";
  questions: TicketQuestionConfig[];
  postedQuestionKeys?: string[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function readStoredGuildId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_GUILD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function createIdempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  // The API only needs a stable, opaque value. This branch supports older
  // browsers and test runners without weakening server-side validation.
  return `moderation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Session and guild selection are application state, not component state. A
// layout and a page can therefore never silently disagree about the server.
let cachedSession: ModerationSession | null = null;
let sessionListeners: Array<() => void> = [];
let activeGuildId: string | null = readStoredGuildId();
let activeGuildListeners: Array<() => void> = [];
let sessionRequest: Promise<ModerationSession> | null = null;
let sessionEpoch = 0;
let csrfSessionRefresh: Promise<void> | null = null;
const CSRF_ERROR_MESSAGE = "A valid CSRF token is required";

function notifySession() {
  sessionListeners.forEach(fn => fn());
}

function notifyActiveGuild() {
  activeGuildListeners.forEach(fn => fn());
}

function setGlobalActiveGuild(guildId: string | null) {
  activeGuildId = guildId;
  if (typeof window !== "undefined") {
    try {
      if (guildId) window.localStorage.setItem(ACTIVE_GUILD_STORAGE_KEY, guildId);
      else window.localStorage.removeItem(ACTIVE_GUILD_STORAGE_KEY);
    } catch {
      // Persistence is a convenience; private browsing must not break the UI.
    }
  }
  notifyActiveGuild();
}

function selectGuildForSession(session: ModerationSession): string | null {
  if (!session.authenticated || !session.guilds?.length) return null;
  const persisted = activeGuildId;
  // Never silently choose a server after sign-in. A persisted choice is safe
  // to restore only when it is one of the guilds returned by the server.
  return session.guilds.some((guild) => guild.id === persisted) ? persisted : null;
}

interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

async function refreshSessionAfterCsrfFailure(): Promise<void> {
  if (!csrfSessionRefresh) {
    const requestEpoch = sessionEpoch;
    const previousUserId = cachedSession?.userId;
    const request = (async () => {
      const { data } = await apiFetchWithMeta<ModerationSession>("/session", {}, false);
      if (requestEpoch !== sessionEpoch) {
        throw new ApiError(403, "Sesiunea s-a schimbat. Reîncarcă pagina înainte de a salva.");
      }
      const sameUser = Boolean(previousUserId && data.authenticated && data.userId === previousUserId);
      cachedSession = data;
      setGlobalActiveGuild(sameUser ? selectGuildForSession(data) : null);
      notifySession();
      if (!sameUser || !data.csrfToken) {
        throw new ApiError(403, "Sesiunea s-a schimbat. Autentifică-te din nou înainte de a salva.");
      }
    })();
    csrfSessionRefresh = request;
    void request.finally(() => {
      if (csrfSessionRefresh === request) csrfSessionRefresh = null;
    }).catch(() => undefined);
  }
  return csrfSessionRefresh;
}

export async function apiFetchWithMeta<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOnCsrfFailure = true,
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  const method = (options.method || "GET").toUpperCase();
  const requestEpoch = sessionEpoch;
  const requestGuildId = activeGuildId;
  if (cachedSession?.csrfToken && !["GET", "HEAD"].includes(method)) {
    headers.set("x-csrf-token", cachedSession.csrfToken);
  }
  headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      cache: options.cache ?? "no-store",
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
      if (Array.isArray(err.issues) && err.issues.length > 0) {
        const details = err.issues
          .slice(0, 3)
          .map((issue: { path?: string; message?: string }) =>
            `${issue.path || "setare"}: ${issue.message || "valoare invalidă"}`)
          .join("; ");
        errorMsg = `${errorMsg}: ${details}`;
      }
    } catch {}
    if (
      retryOnCsrfFailure &&
      res.status === 403 &&
      errorMsg === CSRF_ERROR_MESSAGE &&
      !["GET", "HEAD"].includes(method)
    ) {
      await refreshSessionAfterCsrfFailure();
      if (sessionEpoch !== requestEpoch || activeGuildId !== requestGuildId) {
        throw new ApiError(403, "Serverul sau sesiunea s-a schimbat. Reîncarcă setările înainte de a salva.");
      }
      return apiFetchWithMeta<T>(endpoint, options, false);
    }
    throw new ApiError(res.status, errorMsg);
  }

  const text = await res.text();
  return {
    data: (text ? JSON.parse(text) : undefined) as T,
    headers: res.headers,
  };
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return (await apiFetchWithMeta<T>(endpoint, options)).data;
}

export function useModerationAuthConfig() {
  const [authConfig, setAuthConfig] = useState<ModerationAuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);

  const fetchAuthConfig = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const data = await withAuthRequestTimeout((signal) => apiFetch<ModerationAuthConfig>("/auth-config", { signal }));
      if (
        typeof data?.discordOAuthConfigured !== "boolean" ||
        typeof data?.authorizationUrl !== "string" ||
        !data.authorizationUrl
      ) {
        throw new ApiError(0, "Configurația autentificării Discord este invalidă.");
      }
      if (thisRequest !== requestId.current) return data;
      setAuthConfig(data);
      return data;
    } catch (e: any) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : "Nu am putut încărca configurația autentificării.");
      if (thisRequest === requestId.current) {
        setAuthConfig(null);
        setError(apiError);
      }
      throw apiError;
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAuthConfig().catch(() => undefined);
  }, [fetchAuthConfig]);

  return { authConfig, loading, error, retry: fetchAuthConfig };
}

export function useSession() {
  const [session, setSession] = useState<ModerationSession | null>(cachedSession);
  const [loading, setLoading] = useState(!cachedSession);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchSession = useCallback(async () => {
    if (sessionRequest) return sessionRequest;
    const requestEpoch = sessionEpoch;
    let request!: Promise<ModerationSession>;
    request = (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await withAuthRequestTimeout((signal) => apiFetchWithMeta<ModerationSession>("/session", { signal }));
        const data = response.data;
        if (requestEpoch !== sessionEpoch) return cachedSession ?? { authenticated: false };
        cachedSession = data;
        setSession(data);
        setGlobalActiveGuild(selectGuildForSession(data));
        notifySession();
        return data;
      } catch (e: any) {
        // A response from a request started before login/logout must not
        // overwrite the newer authentication state.
        if (requestEpoch !== sessionEpoch) return cachedSession ?? { authenticated: false };
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          const unauth = { authenticated: false };
          cachedSession = unauth;
          setGlobalActiveGuild(null);
          setSession(unauth);
          notifySession();
          return unauth;
        }
        // Don't auto-logout on 502/network errors.
        const apiError = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : "Nu am putut verifica sesiunea.");
        setError(apiError);
        throw apiError;
      } finally {
        setLoading(false);
        if (sessionRequest === request) sessionRequest = null;
      }
    })();
    sessionRequest = request;
    return request;
  }, []);

  useEffect(() => {
    const handler = () => setSession(cachedSession);
    sessionListeners.push(handler);
    if (!cachedSession) {
      void fetchSession()
        .then(() => setLoading(false))
        .catch((error: ApiError) => {
          setLoading(false);
          setError(error instanceof ApiError ? error : new ApiError(0, "Unknown error"));
        });
    }
    return () => { sessionListeners = sessionListeners.filter(f => f !== handler); };
  }, [fetchSession]);

  const logout = async () => {
    const logoutCsrfToken = cachedSession?.csrfToken;
    sessionEpoch += 1;
    sessionRequest = null;
    // Invalidate local auth and guild/mutation eligibility before awaiting
    // the network request. The captured token is used only for this logout
    // request because cachedSession is intentionally cleared first.
    cachedSession = { authenticated: false };
    setGlobalActiveGuild(null);
    setSession(cachedSession);
    notifySession();
    try {
      await apiFetch("/logout", {
        method: "POST",
        headers: logoutCsrfToken ? { "x-csrf-token": logoutCsrfToken } : undefined,
      });
    } catch {}
  };

  return { session, loading, error, logout, retry: fetchSession };
}

export function useActiveGuild() {
  const { session } = useSession();
  const [guildId, setGuildState] = useState<string | null>(activeGuildId);

  useEffect(() => {
    const handler = () => setGuildState(activeGuildId);
    activeGuildListeners.push(handler);
    setGuildState(activeGuildId);
    return () => {
      activeGuildListeners = activeGuildListeners.filter((listener) => listener !== handler);
    };
  }, []);

  useEffect(() => {
    // `null` means the session request is still loading. Do not clear the
    // persisted choice before that request tells us which guilds are allowed.
    if (!session) return;
    const nextGuildId = selectGuildForSession(session);
    if (nextGuildId !== activeGuildId) {
      setGlobalActiveGuild(nextGuildId);
    }
  }, [session]);

  const setGuildId = useCallback((nextGuildId: string | null) => {
    if (nextGuildId && !session?.guilds?.some((guild) => guild.id === nextGuildId)) return;
    setGlobalActiveGuild(nextGuildId);
  }, [session]);

  return { guildId, setGuildId, guilds: session?.guilds || [] };
}

export function useModerationConfig(guildId: string | null) {
  const [data, setData] = useState<any>(null);
  const [dataGuildId, setDataGuildId] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const currentGuildId = useRef(guildId);
  const controllerRef = useRef<AbortController | null>(null);
  const versionRef = useRef<string | null>(null);
  const dataGuildIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentGuildId.current = guildId;
    requestId.current += 1;
    controllerRef.current?.abort();
    setData(null);
    setDataGuildId(null);
    setVersion(null);
    dataGuildIdRef.current = null;
    versionRef.current = null;
    setError(null);
    setLoading(Boolean(guildId));
  }, [guildId]);

  const fetchConfig = useCallback(async () => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) {
      setData(null);
      setDataGuildId(null);
      setVersion(null);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    // A refetch is a new canonical snapshot. Clear the old object before the
    // response arrives so a caller explicitly discarding a draft cannot
    // accidentally initialize from the previous ETag/config pair.
    setData(null);
    setDataGuildId(null);
    setVersion(null);
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchWithMeta<any>(`/guilds/${requestedGuildId}/config`, { signal: controller.signal });
      if (currentGuildId.current !== requestedGuildId || requestId.current !== thisRequest) return;
      setData(response.data.config);
      setDataGuildId(requestedGuildId);
      dataGuildIdRef.current = requestedGuildId;
      const etag = response.headers.get("etag")?.replace(/^W\//, "");
      const nextVersion = response.data.version ?? etag;
      setVersion(nextVersion == null ? null : String(nextVersion));
      versionRef.current = nextVersion == null ? null : String(nextVersion);
      setError(nextVersion == null ? new Error("Configurația nu conține o versiune ETag.") : null);
      return response.data.config;
    } catch (err: any) {
      if (err?.name !== "AbortError" && currentGuildId.current === requestedGuildId && requestId.current === thisRequest) {
        setData(null);
        setDataGuildId(null);
        setVersion(null);
        setError(err);
      }
    } finally {
      if (currentGuildId.current === requestedGuildId && requestId.current === thisRequest) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const update = async (newData: any) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (!cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
      throw new Error("Sesiunea de moderare nu mai este activă.");
    }
    const currentVersion = versionRef.current ?? version;
    const currentDataGuildId = dataGuildIdRef.current ?? dataGuildId;
    if (!currentVersion) throw new Error("Missing config version");
    if (currentGuildId.current !== requestedGuildId || currentDataGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat. Reîncarcă configurația înainte de salvare.");
    }
    const writeRequest = ++requestId.current; // A pending GET must not overwrite a newer write.
    controllerRef.current?.abort();
    try {
      const response = await apiFetchWithMeta<any>(`/guilds/${requestedGuildId}/config`, {
        method: "PUT",
        headers: { "If-Match": currentVersion.startsWith('"') ? currentVersion : `"${currentVersion}"` },
        body: JSON.stringify(newData),
      });
      if (requestId.current !== writeRequest || currentGuildId.current !== requestedGuildId || !cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
        throw new Error("Serverul selectat s-a schimbat în timpul salvării.");
      }
      const res = response.data;
      setData(res.config);
      setDataGuildId(requestedGuildId);
      dataGuildIdRef.current = requestedGuildId;
      const etag = response.headers.get("etag")?.replace(/^W\//, "");
      const nextVersion = res.version ?? etag;
      if (nextVersion == null) throw new Error("Răspunsul de salvare nu conține versiunea ETag.");
      setVersion(String(nextVersion));
      versionRef.current = String(nextVersion);
      setError(null);
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

  const updateSection = async (keys: string[], draft: any) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (!cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
      throw new Error("Sesiunea de moderare nu mai este activă.");
    }
    const writeRequest = ++requestId.current;
    controllerRef.current?.abort();

    const saveAttempt = async () => {
      const snapshot = await apiFetchWithMeta<any>(`/guilds/${requestedGuildId}/config`);
      if (requestId.current !== writeRequest || currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
        throw new Error("Serverul selectat s-a schimbat în timpul salvării.");
      }
      const snapshotVersion = snapshot.data.version
        ?? snapshot.headers.get("etag")?.replace(/^W\//, "").replaceAll('"', "");
      if (snapshotVersion == null) throw new Error("Configurația nu conține o versiune ETag.");
      const merged = structuredClone(snapshot.data.config);
      for (const key of keys) {
        const parts = key.split(".");
        let target = merged;
        let source = draft;
        for (const part of parts.slice(0, -1)) {
          target = target[part] ??= {};
          source = source[part];
        }
        const leaf = parts[parts.length - 1];
        target[leaf] = structuredClone(source[leaf]);
      }
      return apiFetchWithMeta<any>(`/guilds/${requestedGuildId}/config`, {
        method: "PUT",
        headers: { "If-Match": `"${snapshotVersion}"` },
        body: JSON.stringify(merged),
      });
    };

    let response;
    try {
      response = await saveAttempt();
    } catch (error) {
      // Re-read and reapply only this editor's fields. Never retry a stale
      // full configuration, because dashboard toggles may have changed it.
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      response = await saveAttempt();
    }
    if (requestId.current !== writeRequest || currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat în timpul salvării.");
    }
    const result = response.data;
    const nextVersion = result.version
      ?? response.headers.get("etag")?.replace(/^W\//, "").replaceAll('"', "");
    if (nextVersion == null) throw new Error("Răspunsul de salvare nu conține versiunea ETag.");
    setData(result.config);
    setDataGuildId(requestedGuildId);
    dataGuildIdRef.current = requestedGuildId;
    setVersion(String(nextVersion));
    versionRef.current = String(nextVersion);
    setError(null);
    return result;
  };

  const createChannel = async (destination: string) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (!cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
      throw new Error("Sesiunea de moderare nu mai este activă.");
    }
    const currentVersion = versionRef.current ?? version;
    const currentDataGuildId = dataGuildIdRef.current ?? dataGuildId;
    if (!currentVersion || currentDataGuildId !== requestedGuildId) {
      throw new Error("Reîncarcă configurația înainte de a crea un canal.");
    }

    const writeRequest = ++requestId.current;
    controllerRef.current?.abort();
    const isCurrentRequest = () =>
      requestId.current === writeRequest &&
      currentGuildId.current === requestedGuildId &&
      activeGuildId === requestedGuildId &&
      cachedSession?.authenticated;
    const normalizeVersion = (value: unknown) => String(value ?? "").replace(/^W\//, "").replaceAll('"', "");
    const createWithVersion = (revision: string) => apiFetchWithMeta<any>(
      `/guilds/${requestedGuildId}/config/channels`,
      {
        method: "POST",
        headers: { "If-Match": `"${normalizeVersion(revision)}"` },
        body: JSON.stringify({ destination }),
      },
    );

    let response;
    try {
      try {
        response = await createWithVersion(currentVersion);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const latest = await apiFetchWithMeta<any>(`/guilds/${requestedGuildId}/config`);
        if (!isCurrentRequest()) throw new Error("Serverul selectat s-a schimbat în timpul creării canalului.");
        const latestVersion = latest.data.version
          ?? latest.headers.get("etag")?.replace(/^W\//, "");
        if (latestVersion == null) throw new Error("Configurația nu conține o versiune ETag.");
        response = await createWithVersion(String(latestVersion));
      }
      if (!isCurrentRequest()) throw new Error("Serverul selectat s-a schimbat în timpul creării canalului.");
      const result = response.data;
      const nextVersion = result.version
        ?? response.headers.get("etag")?.replace(/^W\//, "").replaceAll('"', "");
      if (nextVersion == null) throw new Error("Răspunsul de creare nu conține versiunea configurației.");
      setData(result.config);
      setDataGuildId(requestedGuildId);
      dataGuildIdRef.current = requestedGuildId;
      setVersion(String(nextVersion));
      versionRef.current = String(nextVersion);
      setError(null);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new Error("Conflict de versiune: configurația s-a schimbat din nou. Reîncarcă și încearcă din nou.");
      }
      if (error instanceof ApiError && error.status === 428) {
        throw new Error("Eroare de sistem: lipsește versiunea configurației (If-Match).");
      }
      throw error;
    }
  };

  const updateProtectionToggle = async (
    key: "protection" | "autoMod" | "wordFilter" | "linkBlock" | "antiRaid" | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai" | "manualTools" | "cases" | "audit" | "escalation" | "embeds",
    enabled: boolean,
  ) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (!cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
      throw new Error("Sesiunea de moderare nu mai este activă.");
    }
    const response = await apiFetchWithMeta<any>(`/guilds/${requestedGuildId}/protection-toggle`, {
      method: "PUT",
      body: JSON.stringify({ key, enabled }),
    });
    const res = response.data;
    if (currentGuildId.current !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat în timpul salvării.");
    }
    setData(res.config);
    setDataGuildId(requestedGuildId);
    dataGuildIdRef.current = requestedGuildId;
    const etag = response.headers.get("etag")?.replace(/^W\//, "");
    const nextVersion = res.version ?? etag;
    if (nextVersion == null) throw new Error("Răspunsul de salvare nu conține versiunea ETag.");
    setVersion(String(nextVersion));
    versionRef.current = String(nextVersion);
    setError(null);
    return res;
  };

  return {
    data: dataGuildId === guildId ? data : null,
    version: dataGuildId === guildId ? version : null,
    loading: loading || Boolean(guildId && dataGuildId !== guildId),
    error,
    update,
    updateSection,
    createChannel,
    updateProtectionToggle,
    refetch: fetchConfig,
  };
}

export function useGameplayState(guildId: string | null) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [pausedGuildId, setPausedGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(guildId));
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const currentGuildId = useRef(guildId);

  const refetch = useCallback(async () => {
    const requestedGuildId = guildId;
    const thisRequest = ++requestId.current;
    setPaused(null);
    setPausedGuildId(null);
    if (!requestedGuildId) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ paused: boolean }>(`/guilds/${requestedGuildId}/gameplay-state`);
      if (typeof result?.paused !== "boolean") {
        throw new Error("Răspunsul nu conține o stare validă a jocului.");
      }
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        setPaused(result.paused);
        setPausedGuildId(requestedGuildId);
      }
    } catch (err: any) {
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        setPaused(null);
        setPausedGuildId(null);
        setError(err instanceof Error ? err : new Error("Nu s-a putut încărca starea jocului."));
      }
    } finally {
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    currentGuildId.current = guildId;
    void refetch();
  }, [refetch]);

  const update = useCallback(async (nextPaused: boolean) => {
    if (!guildId) throw new Error("Nu este selectat niciun server.");
    if (pausedGuildId !== guildId || paused === null) {
      throw new Error("Starea jocului nu este confirmată. Reîncarcă starea înainte de a o schimba.");
    }
    const result = await apiFetch<{ paused: boolean }>(`/guilds/${guildId}/gameplay-state`, {
      method: "PUT",
      body: JSON.stringify({ paused: nextPaused }),
    });
    if (typeof result?.paused !== "boolean") {
      throw new Error("Răspunsul nu conține o stare validă a jocului.");
    }
    if (currentGuildId.current !== guildId) {
      throw new Error("Serverul selectat s-a schimbat în timpul salvării stării jocului.");
    }
    setPaused(result.paused);
    setPausedGuildId(guildId);
    setError(null);
    return result.paused;
  }, [guildId, paused, pausedGuildId]);

  return {
    paused: pausedGuildId === guildId ? paused : null,
    loading,
    error,
    update,
    refetch,
  };
}

export interface PartialBotControlApplyResponse {
  partialApply: true;
  verificationPanelPublished?: boolean;
  message?: string;
  verification?: unknown;
}

export function isPartialBotControlApplyResponse(value: unknown): value is PartialBotControlApplyResponse {
  return typeof value === "object" && value !== null &&
    (value as { partialApply?: unknown }).partialApply === true;
}

export interface BotControlPanelRecovery {
  message: string;
  panelMessageId?: string;
  requiresManualReconciliation: boolean;
  manualReconciliationComplete: boolean;
  storageUnavailable?: boolean;
}

const BOT_CONTROL_PANEL_RECOVERY_STORAGE_KEY = "moderation.botControlPanelRecovery.v1";

function restoreBotControlPanelRecovery(): Map<string, BotControlPanelRecovery> {
  const recovered = new Map<string, BotControlPanelRecovery>();
  if (typeof window === "undefined") return recovered;
  try {
    const stored = window.sessionStorage.getItem(BOT_CONTROL_PANEL_RECOVERY_STORAGE_KEY);
    if (!stored) return recovered;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return recovered;
    for (const [guildId, raw] of Object.entries(parsed)) {
      if (!guildId || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as {
        panelMessageId?: unknown;
        requiresManualReconciliation?: unknown;
        manualReconciliationComplete?: unknown;
      };
      const panelMessageId = typeof item.panelMessageId === "string" ? item.panelMessageId.trim() : "";
      const requiresManualReconciliation = item.requiresManualReconciliation === true;
      const manualReconciliationComplete = item.manualReconciliationComplete === true;
      if (!panelMessageId && !requiresManualReconciliation && !manualReconciliationComplete) continue;
      recovered.set(guildId, {
        message: panelMessageId
          ? "ID-ul panoului publicat a fost recuperat din stocarea acestei sesiuni."
          : "Discord a publicat panoul, dar ID-ul nu este disponibil; reconcilierea manuală este necesară.",
        panelMessageId: panelMessageId || undefined,
        requiresManualReconciliation,
        manualReconciliationComplete,
      });
    }
  } catch {
    // Storage may be disabled or contain malformed data. The UI will fail
    // closed if a subsequent partial publish cannot be persisted.
  }
  return recovered;
}

const botControlPanelRecoveryByGuild = restoreBotControlPanelRecovery();

function persistBotControlPanelRecovery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const persisted = Object.fromEntries(
      [...botControlPanelRecoveryByGuild.entries()].map(([guildId, recovery]) => [
        guildId,
        {
          ...(recovery.panelMessageId ? { panelMessageId: recovery.panelMessageId } : {}),
          requiresManualReconciliation: recovery.requiresManualReconciliation,
          manualReconciliationComplete: recovery.manualReconciliationComplete,
        },
      ]),
    );
    window.sessionStorage.setItem(BOT_CONTROL_PANEL_RECOVERY_STORAGE_KEY, JSON.stringify(persisted));
    return true;
  } catch {
    return false;
  }
}

function storeBotControlPanelRecovery(
  guildId: string,
  recovery: BotControlPanelRecovery,
): BotControlPanelRecovery {
  botControlPanelRecoveryByGuild.set(guildId, recovery);
  if (persistBotControlPanelRecovery()) return recovery;

  for (const [storedGuildId, storedRecovery] of botControlPanelRecoveryByGuild) {
    const storageUnavailable: BotControlPanelRecovery = {
      ...storedRecovery,
      message: "Nu s-a putut păstra recuperarea panoului în stocarea sesiunii. Reconciliază manual panoul înainte de reîncercare; reîncărcarea poate pierde ID-ul recuperat.",
      requiresManualReconciliation: !storedRecovery.manualReconciliationComplete,
      storageUnavailable: true,
    };
    botControlPanelRecoveryByGuild.set(storedGuildId, storageUnavailable);
  }
  return botControlPanelRecoveryByGuild.get(guildId)!;
}

export class BotControlPartialApplyError extends Error {
  readonly verificationPanelPublished: boolean;
  readonly panelMessageId?: string;

  constructor(response: PartialBotControlApplyResponse, canonicalReloaded: boolean) {
    const verificationPanelPublished = response.verificationPanelPublished === true;
    const summary = verificationPanelPublished
      ? "Panoul de verificare a fost publicat pe Discord, dar cererea nu a fost finalizată integral."
      : "Serverul a raportat un rezultat parțial; configurația și efectele Discord trebuie verificate.";
    const verification = response.verification;
    const panelMessageId = verification && typeof verification === "object"
      ? (verification as { panelMessageId?: unknown }).panelMessageId
      : undefined;
    const reloadMessage = canonicalReloaded
      ? " Configurația canonică a fost reîncărcată."
      : " Reîncărcarea configurației canonice a eșuat; ultima stare confirmată a fost păstrată.";
    super([
      summary,
      verificationPanelPublished ? response.message : undefined,
      reloadMessage,
    ].filter(Boolean).join(" "));
    this.verificationPanelPublished = verificationPanelPublished;
    if (typeof panelMessageId === "string" && panelMessageId.trim()) {
      this.panelMessageId = panelMessageId.trim();
    }
    this.name = "BotControlPartialApplyError";
  }
}

export function useBotControl(guildId: string | null) {
  const [data, setData] = useState<BotControlConfig | null>(null);
  const [dataGuildId, setDataGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(guildId));
  const [error, setError] = useState<ApiError | null>(null);
  const [panelRecovery, setPanelRecovery] = useState<BotControlPanelRecovery | null>(
    () => guildId ? botControlPanelRecoveryByGuild.get(guildId) ?? null : null,
  );
  const requestId = useRef(0);
  const currentGuildId = useRef(guildId);

  useEffect(() => {
    currentGuildId.current = guildId;
    requestId.current += 1;
    setData(null);
    setDataGuildId(null);
    setError(null);
    setLoading(Boolean(guildId));
    setPanelRecovery(guildId ? botControlPanelRecoveryByGuild.get(guildId) ?? null : null);
  }, [guildId]);

  const fetchControl = useCallback(async (preserveExistingOnError = false): Promise<BotControlConfig | null> => {
    const requestedGuildId = guildId;
    const thisRequest = ++requestId.current;
    if (!requestedGuildId) {
      setData(null);
      setDataGuildId(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<unknown>(`/guilds/${requestedGuildId}/bot-control`);
      if (isPartialBotControlApplyResponse(response)) {
        throw new Error("Reîncărcarea configurației Control Bot a returnat un rezultat parțial invalid.");
      }
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        const canonical = response as BotControlConfig;
        setData(canonical);
        setDataGuildId(requestedGuildId);
        return canonical;
      }
      return null;
    } catch (err: any) {
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        if (!preserveExistingOnError) {
          setData(null);
          setDataGuildId(null);
        }
        setError(err);
      }
      return null;
    } finally {
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void fetchControl();
  }, [fetchControl]);

  const update = async (value: BotControlConfig) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (dataGuildId !== requestedGuildId || activeGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat. Reîncarcă setările înainte de salvare.");
    }
    const pendingPanelRecovery = botControlPanelRecoveryByGuild.get(requestedGuildId);
    if (pendingPanelRecovery?.requiresManualReconciliation) {
      throw new Error("Salvarea este blocată: reconciliază manual în Discord panoul publicat fără ID înainte de a reîncerca.");
    }
    const writeRequest = ++requestId.current;
    try {
      // Both fields are response-only. A provision response includes a summary
      // that the strict PUT schema explicitly rejects on the next edit.
      const payloadSource = pendingPanelRecovery?.panelMessageId
        ? {
            ...value,
            verification: {
              ...value.verification,
              panelMessageId: pendingPanelRecovery.panelMessageId,
            },
          }
        : value;
      const { discordLive: _discardedStatus, provisioning: _discardedProvisioning, ...payload } = payloadSource;
      const result = await apiFetch<unknown>(`/guilds/${requestedGuildId}/bot-control`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (isPartialBotControlApplyResponse(result)) {
        if (result.verificationPanelPublished === true) {
          const responseVerification = result.verification && typeof result.verification === "object"
            ? result.verification as { panelMessageId?: unknown }
            : null;
          const responsePanelId = typeof responseVerification?.panelMessageId === "string"
            ? responseVerification.panelMessageId.trim()
            : "";
          const submittedPanelId = typeof payload.verification?.panelMessageId === "string"
            ? payload.verification.panelMessageId.trim()
            : "";
          const panelMessageId = responsePanelId || submittedPanelId || pendingPanelRecovery?.panelMessageId;
          const recoveredPanel: BotControlPanelRecovery = {
            message: "",
            panelMessageId,
            requiresManualReconciliation: !panelMessageId,
            manualReconciliationComplete: false,
          };
          const storedRecovery = storeBotControlPanelRecovery(requestedGuildId, recoveredPanel);
          if (currentGuildId.current === requestedGuildId && activeGuildId === requestedGuildId) {
            setPanelRecovery(storedRecovery);
          }
        }
        if (requestId.current !== writeRequest || currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
          throw new Error("Serverul selectat s-a schimbat în timpul salvării.");
        }
        const canonical = await fetchControl(true);
        if (currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
          throw new Error("Serverul selectat s-a schimbat în timpul reîncărcării configurației.");
        }
        const partialError = new BotControlPartialApplyError(result, canonical !== null);
        if (result.verificationPanelPublished === true) {
          const previousRecovery = botControlPanelRecoveryByGuild.get(requestedGuildId);
          if (previousRecovery) {
            const updatedRecovery = { ...previousRecovery, message: partialError.message };
            const storedRecovery = storeBotControlPanelRecovery(requestedGuildId, updatedRecovery);
            setPanelRecovery(storedRecovery);
          }
        }
        throw partialError;
      }
      if (requestId.current !== writeRequest || currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
        throw new Error("Serverul selectat s-a schimbat în timpul salvării.");
      }
      const saved = result as BotControlConfig;
      setData(saved);
      setDataGuildId(requestedGuildId);
      botControlPanelRecoveryByGuild.delete(requestedGuildId);
      persistBotControlPanelRecovery();
      setPanelRecovery(null);
      return saved;
    } catch (err) {
      throw err;
    }
  };

  const publishVerification = async (value: BotControlConfig["verification"]) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (dataGuildId !== requestedGuildId || activeGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat. Reîncarcă setările înainte de publicare.");
    }
    const pendingPanelRecovery = botControlPanelRecoveryByGuild.get(requestedGuildId);
    if (pendingPanelRecovery?.requiresManualReconciliation) {
      throw new Error("Publicarea este blocată: reconciliază manual în Discord panoul fără ID înainte de a reîncerca.");
    }
    const submittedVerification = pendingPanelRecovery?.panelMessageId
      ? { ...value, panelMessageId: pendingPanelRecovery.panelMessageId }
      : value;
    const writeRequest = ++requestId.current;
    const result = await apiFetch<unknown>(`/guilds/${requestedGuildId}/bot-control/verification-panel`, {
      method: "POST",
      body: JSON.stringify(submittedVerification),
    });

    if (isPartialBotControlApplyResponse(result)) {
      if (result.verificationPanelPublished === true) {
        const responseVerification = result.verification && typeof result.verification === "object"
          ? result.verification as { panelMessageId?: unknown }
          : null;
        const responsePanelId = typeof responseVerification?.panelMessageId === "string"
          ? responseVerification.panelMessageId.trim()
          : "";
        const submittedPanelId = typeof submittedVerification.panelMessageId === "string"
          ? submittedVerification.panelMessageId.trim()
          : "";
        const panelMessageId = responsePanelId || submittedPanelId || pendingPanelRecovery?.panelMessageId;
        const recoveredPanel: BotControlPanelRecovery = {
          message: "",
          panelMessageId,
          requiresManualReconciliation: !panelMessageId,
          manualReconciliationComplete: false,
        };
        const storedRecovery = storeBotControlPanelRecovery(requestedGuildId, recoveredPanel);
        if (currentGuildId.current === requestedGuildId && activeGuildId === requestedGuildId) {
          setPanelRecovery(storedRecovery);
        }
      }
      if (
        requestId.current !== writeRequest ||
        currentGuildId.current !== requestedGuildId ||
        activeGuildId !== requestedGuildId
      ) {
        throw new Error("Serverul selectat s-a schimbat în timpul publicării.");
      }
      const canonical = await fetchControl(true);
      if (currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
        throw new Error("Serverul selectat s-a schimbat în timpul reîncărcării configurației.");
      }
      const partialError = new BotControlPartialApplyError(result, canonical !== null);
      if (result.verificationPanelPublished === true) {
        const previousRecovery = botControlPanelRecoveryByGuild.get(requestedGuildId);
        if (previousRecovery) {
          const updatedRecovery = { ...previousRecovery, message: partialError.message };
          const storedRecovery = storeBotControlPanelRecovery(requestedGuildId, updatedRecovery);
          setPanelRecovery(storedRecovery);
        }
      }
      throw partialError;
    }

    if (
      requestId.current !== writeRequest ||
      currentGuildId.current !== requestedGuildId ||
      activeGuildId !== requestedGuildId
    ) {
      throw new Error("Serverul selectat s-a schimbat în timpul publicării.");
    }
    const savedVerification = (result as { verification?: unknown })?.verification;
    if (
      !savedVerification ||
      typeof savedVerification !== "object" ||
      Array.isArray(savedVerification) ||
      typeof (savedVerification as { panelMessageId?: unknown }).panelMessageId !== "string"
    ) {
      throw new Error("Serverul nu a returnat configurația panoului publicat.");
    }
    const saved = savedVerification as BotControlConfig["verification"];
    setData((current) => current ? { ...current, verification: saved } : current);
    setDataGuildId(requestedGuildId);
    setError(null);
    botControlPanelRecoveryByGuild.delete(requestedGuildId);
    persistBotControlPanelRecovery();
    setPanelRecovery(null);
    return saved;
  };

  const confirmPanelReconciliation = () => {
    if (!guildId) return;
    const current = botControlPanelRecoveryByGuild.get(guildId);
    if (!current?.requiresManualReconciliation) return;
    const reconciled = {
      ...current,
      requiresManualReconciliation: false,
      manualReconciliationComplete: true,
    };
    const storedRecovery = storeBotControlPanelRecovery(guildId, reconciled);
    setPanelRecovery(storedRecovery);
  };

  const provisionChannels = async (
    categories?: string[],
    permissions?: Record<string, ChannelPermissionConfig>,
  ) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (dataGuildId !== requestedGuildId || activeGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat. Reîncarcă setările înainte de provisioning.");
    }
    const writeRequest = ++requestId.current;
    const saved = await apiFetch<BotControlConfig>(`/guilds/${requestedGuildId}/bot-control/provision-channels`, {
      method: "POST",
      body: JSON.stringify(categories ? { categories, permissions } : {}),
    });
    if (requestId.current !== writeRequest || currentGuildId.current !== requestedGuildId || activeGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat în timpul provisioningului.");
    }
    setData(saved);
    setDataGuildId(requestedGuildId);
    return saved;
  };

  const leaveServer = async (targetGuildId: string) => {
    if (!targetGuildId) throw new Error("Nu este selectat niciun server.");
    if (activeGuildId !== targetGuildId) {
      throw new Error("Serverul selectat s-a schimbat. Reîncarcă pagina înainte de a continua.");
    }
    const result = await apiFetch<{ left: boolean; guildId: string; guildName: string }>(
      `/guilds/${targetGuildId}/bot-control/leave`,
      { method: "POST", body: "{}" },
    );
    if (result.left !== true || result.guildId !== targetGuildId) {
      throw new Error("Serverul nu a confirmat ieșirea botului de pe serverul selectat.");
    }
    return result;
  };

  return {
    data: dataGuildId === guildId ? data : null,
    loading: loading || Boolean(guildId && dataGuildId !== guildId),
    error,
    update,
    publishVerification,
    panelRecovery,
    confirmPanelReconciliation,
    provisionChannels,
    leaveServer,
    refetch: fetchControl,
  };
}

export function useInviteStats(guildId: string | null, range: InviteStatsRange) {
  const [data, setData] = useState<InviteStatsResponse | null>(null);
  const [dataGuildId, setDataGuildId] = useState<string | null>(null);
  const [dataRange, setDataRange] = useState<InviteStatsRange | null>(null);
  const [loading, setLoading] = useState(Boolean(guildId));
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);
  const currentGuildId = useRef(guildId);

  useEffect(() => {
    currentGuildId.current = guildId;
    requestId.current += 1;
    setData(null);
    setDataGuildId(null);
    setDataRange(null);
    setError(null);
    setLoading(Boolean(guildId));
  }, [guildId, range]);

  const fetchStats = useCallback(async () => {
    const requestedGuildId = guildId;
    const requestedRange = range;
    const thisRequest = ++requestId.current;
    if (!requestedGuildId) {
      setData(null);
      setDataGuildId(null);
      setDataRange(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<InviteStatsResponse>(
        `/guilds/${requestedGuildId}/invite-stats?range=${requestedRange}`,
      );
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        setData(response);
        setDataGuildId(requestedGuildId);
        setDataRange(requestedRange);
      }
      return response;
    } catch (err) {
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        setData(null);
        setDataGuildId(null);
        setDataRange(null);
        setError(err as ApiError);
      }
      throw err;
    } finally {
      if (requestId.current === thisRequest && currentGuildId.current === requestedGuildId) {
        setLoading(false);
      }
    }
  }, [guildId, range]);

  useEffect(() => {
    void fetchStats().catch(() => {});
  }, [fetchStats]);

  const sync = useCallback(async () => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("Nu este selectat niciun server.");
    if (activeGuildId !== requestedGuildId) {
      throw new Error("Serverul selectat s-a schimbat. Reîncarcă pagina înainte de sincronizare.");
    }
    setSyncing(true);
    setError(null);
    try {
      await apiFetch(`/guilds/${requestedGuildId}/invite-stats/sync`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return await fetchStats();
    } catch (err) {
      setError(err as ApiError);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchStats, guildId]);

  return {
    data: dataGuildId === guildId && dataRange === range ? data : null,
    loading: loading || Boolean(guildId && (dataGuildId !== guildId || dataRange !== range)),
    syncing,
    error,
    refresh: fetchStats,
    sync,
  };
}

export function useVerifiedMembers(guildId: string | null) {
  const [data, setData] = useState<VerifiedMembersResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(guildId));
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);

  const fetchMembers = useCallback(async () => {
    const requestedGuildId = guildId;
    const thisRequest = ++requestId.current;
    if (!requestedGuildId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<VerifiedMembersResponse>(`/guilds/${requestedGuildId}/verification/members`);
      if (requestId.current === thisRequest) setData(response);
    } catch (err: any) {
      if (requestId.current === thisRequest) {
        setData(null);
        setError(err);
      }
    } finally {
      if (requestId.current === thisRequest) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  return { data, loading, error, refetch: fetchMembers };
}

export function useModerationMetadata(guildId: string | null) {
  const [data, setData] = useState<ModerationMetadata | null>(null);
  const [dataGuildId, setDataGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const currentGuildId = useRef(guildId);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    currentGuildId.current = guildId;
    requestId.current += 1;
    controllerRef.current?.abort();
    setData(null);
    setDataGuildId(null);
    setError(null);
    setLoading(Boolean(guildId));
  }, [guildId]);

  const fetchMetadata = useCallback(async () => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) {
      setData(null);
      setDataGuildId(null);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const result = await apiFetch<ModerationMetadata>(`/guilds/${requestedGuildId}/metadata`, { signal: controller.signal });
      if (currentGuildId.current !== requestedGuildId || requestId.current !== thisRequest) return;
      setData(result);
      setDataGuildId(requestedGuildId);
      setError(null);
    } catch (err: any) {
      if (err?.name !== "AbortError" && currentGuildId.current === requestedGuildId && requestId.current === thisRequest) {
        setData(null);
        setDataGuildId(null);
        setError(err);
      }
    } finally {
      if (currentGuildId.current === requestedGuildId && requestId.current === thisRequest) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void fetchMetadata(); }, [fetchMetadata]);

  return {
    data: dataGuildId === guildId ? data : null,
    loading: loading || Boolean(guildId && dataGuildId !== guildId),
    error,
    refetch: fetchMetadata,
  };
}

export function useCases(guildId: string | null, params?: { status?: string, userId?: string, limit?: number, offset?: number }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const dataGuildId = useRef<string | null>(null);
  const requestId = useRef(0);

  const fetchCases = useCallback(async () => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) {
      requestId.current += 1;
      dataGuildId.current = null;
      setData([]);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    setLoading(true);
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.userId) query.set("userId", params.userId);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    
    try {
      const res = await apiFetch<any>(`/guilds/${requestedGuildId}/cases?${query}`);
      if (requestedGuildId !== guildId || thisRequest !== requestId.current) return;
      dataGuildId.current = requestedGuildId;
      setData(res.items || []);
    } catch {} finally {
      if (requestedGuildId === guildId && thisRequest === requestId.current) setLoading(false);
    }
  }, [guildId, params?.status, params?.userId, params?.limit, params?.offset]);

  useEffect(() => { fetchCases(); }, [fetchCases]);
  return { data: dataGuildId.current === guildId ? data : [], loading: loading || Boolean(guildId && dataGuildId.current !== guildId), refetch: fetchCases };
}

export function useAuditLogs(guildId: string | null, params: AuditLogQuery = {}) {
  const [data, setData] = useState<ModerationAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const dataGuildId = useRef<string | null>(null);
  const requestId = useRef(0);
  const search = params.search?.trim() ?? "";
  const category = params.category ?? "all";
  const start = params.start ?? "";
  const end = params.end ?? "";
  const limit = params.limit ?? AUDIT_PAGE_SIZE;
  const offset = params.offset ?? 0;

  const fetchLogs = useCallback(async () => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) {
      requestId.current += 1;
      dataGuildId.current = null;
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    if (auditDateRangeError({ start, end })) {
      dataGuildId.current = requestedGuildId;
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setData([]);
    setTotal(0);
    try {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (search) query.set("search", search);
      if (category !== "all") query.set("category", category);
      if (start) query.set("start", new Date(start).toISOString());
      if (end) query.set("end", new Date(end).toISOString());
      const res = await apiFetch<{ items: ModerationAuditLog[]; total: number }>(
        `/guilds/${requestedGuildId}/logs/audit?${query.toString()}`,
      );
      if (requestedGuildId !== guildId || thisRequest !== requestId.current) return;
      dataGuildId.current = requestedGuildId;
      setData(Array.isArray(res.items) ? res.items : []);
      setTotal(Number.isFinite(res.total) ? res.total : 0);
    } catch {} finally {
      if (requestedGuildId === guildId && thisRequest === requestId.current) setLoading(false);
    }
  }, [guildId, search, category, start, end, limit, offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  return {
    data: dataGuildId.current === guildId ? data : [],
    total: dataGuildId.current === guildId ? total : 0,
    loading: loading || Boolean(guildId && dataGuildId.current !== guildId),
    refetch: fetchLogs,
  };
}

export function useManualAction(guildId: string | null) {
  // The same payload keeps its key so a retry can never execute twice. A
  // different payload gets a new key, even if the previous request failed.
  const intentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const currentGuildId = useRef(guildId);
  useEffect(() => {
    currentGuildId.current = guildId;
    intentRef.current = null;
  }, [guildId]);

  const resetKey = useCallback(() => {
    intentRef.current = null;
  }, []);

  const execute = async (payload: { type: string, targetId?: string, reason?: string, durationMinutes?: number, channelId?: string, roleId?: string, nickname?: string, amount?: number }) => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) throw new Error("No guild selected");
    if (!cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
      throw new Error("Sesiunea de moderare nu mai este activă.");
    }
    const fingerprint = JSON.stringify(payload);
    if (intentRef.current?.fingerprint !== fingerprint) {
      intentRef.current = { fingerprint, key: createIdempotencyKey() };
    }
    const idempotencyKey = intentRef.current.key;
    try {
      const res = await apiFetch(`/guilds/${requestedGuildId}/actions`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload)
      });
      if (currentGuildId.current !== requestedGuildId || !cachedSession?.authenticated || activeGuildId !== requestedGuildId) {
        throw new Error("Serverul selectat s-a schimbat în timpul acțiunii.");
      }
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
  const dataKey = useRef<string | null>(null);
  const requestId = useRef(0);

  const fetchDetails = useCallback(async () => {
    const requestedGuildId = guildId;
    const requestedCaseId = caseId;
    if (!requestedCaseId || !requestedGuildId) {
      requestId.current += 1;
      dataKey.current = null;
      setData(null);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/guilds/${requestedGuildId}/cases/${requestedCaseId}`);
      if (requestedGuildId !== guildId || requestedCaseId !== caseId || thisRequest !== requestId.current) return;
      dataKey.current = `${requestedGuildId}:${requestedCaseId}`;
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      if (requestedGuildId === guildId && requestedCaseId === caseId && thisRequest === requestId.current) setLoading(false);
    }
  }, [guildId, caseId]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const updateCase = async (newData: any) => {
    if (!caseId || !guildId) return;
    if (!cachedSession?.authenticated || activeGuildId !== guildId) throw new Error("Sesiunea de moderare nu mai este activă.");
    await apiFetch<any>(`/guilds/${guildId}/cases/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(newData)
    });
    await fetchDetails();
  };

  const addNote = async (text: string) => {
    if (!caseId || !guildId) return;
    if (!cachedSession?.authenticated || activeGuildId !== guildId) throw new Error("Sesiunea de moderare nu mai este activă.");
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
  const dataGuildId = useRef<string | null>(null);
  const requestId = useRef(0);

  const fetchActions = useCallback(async () => {
    const requestedGuildId = guildId;
    if (!requestedGuildId) {
      requestId.current += 1;
      dataGuildId.current = null;
      setData([]);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    setLoading(true);
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    
    try {
      const res = await apiFetch<any>(`/guilds/${requestedGuildId}/actions?${query}`);
      if (requestedGuildId !== guildId || thisRequest !== requestId.current) return;
      dataGuildId.current = requestedGuildId;
      setData(res.items || []);
    } catch {} finally {
      if (requestedGuildId === guildId && thisRequest === requestId.current) setLoading(false);
    }
  }, [guildId, params?.status, params?.limit, params?.offset]);

  useEffect(() => { fetchActions(); }, [fetchActions]);
  return { data: dataGuildId.current === guildId ? data : [], loading: loading || Boolean(guildId && dataGuildId.current !== guildId), refetch: fetchActions };
}

export function useReconcileAction(guildId: string | null) {
  return async (actionId: string, status: "applied" | "failed" | "uncertain", note: string) => {
    if (!guildId) throw new Error("No guild selected");
    if (!cachedSession?.authenticated || activeGuildId !== guildId) throw new Error("Sesiunea de moderare nu mai este activă.");
    return apiFetch(`/guilds/${guildId}/actions/${actionId}/reconcile`, {
      method: "PATCH",
      body: JSON.stringify({ status, note })
    });
  };
}
