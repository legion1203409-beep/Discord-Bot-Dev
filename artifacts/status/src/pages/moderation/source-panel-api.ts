import { apiFetchWithMeta, ApiError } from "../../hooks/use-moderation-api";
import { presentAuditLog, type ModerationAuditLog } from "../../lib/moderation-audit";
import { applyPanelChanges, mapPanelSnapshot, type PanelChange, type PanelMetadata, type PanelModules, type PanelSnapshot } from "./source-panel-mapping";

export type { PanelSnapshot, PanelModuleState } from "./source-panel-mapping";
export type SourcePanelRequest = {
  method: "load" | "loadOther" | "save" | "reset";
  guildId: string;
  defaults: PanelModules;
  changes?: PanelChange[];
};
type Context = {
  activeGuildId: string;
  authorizedGuildIds: string[];
  getActiveGuildId: () => string | null;
};
type ConfigResult = { config: Record<string, any>; version?: string | number };
function assertGuild(request: SourcePanelRequest, context: Context) {
  if (!/^\d{5,25}$/.test(request.guildId) || !context.authorizedGuildIds.includes(request.guildId)) {
    throw new Error("Serverul nu este autorizat în sesiunea Discord.");
  }
  if (context.getActiveGuildId() !== context.activeGuildId) throw new Error("Serverul activ s-a schimbat. Cererea a fost oprită.");
  if (request.method !== "loadOther" && request.guildId !== context.activeGuildId) throw new Error("Cererea nu aparține serverului activ.");
  if (request.method === "loadOther" && request.guildId === context.activeGuildId) throw new Error("Alege un alt server ca sursă.");
}
function assertDefaults(defaults: PanelModules) {
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults) || Object.keys(defaults).length > 50) {
    throw new Error("Structura panoului nu este validă.");
  }
}
export async function handleSourcePanelRequest(request: SourcePanelRequest, context: Context): Promise<PanelSnapshot> {
  assertGuild(request, context);
  assertDefaults(request.defaults);
  if (request.method === "reset") {
    throw new Error("Resetarea întregului panou nu este disponibilă: API-ul poate reseta doar configurația de moderare. Nu s-a resetat nimic.");
  }
  if (!["load", "loadOther", "save"].includes(request.method)) throw new Error("Cerere necunoscută.");
  const endpoint = `/guilds/${encodeURIComponent(request.guildId)}`;
  const [metadataResult, botResult] = await Promise.allSettled([
    apiFetchWithMeta<PanelMetadata>(`${endpoint}/metadata`),
    apiFetchWithMeta<Record<string, any>>(`${endpoint}/bot-control`),
  ]);
  assertGuild(request, context);
  const metadata = metadataResult.status === "fulfilled" ? metadataResult.value.data : {};
  const bot = botResult.status === "fulfilled" ? botResult.value.data : undefined;
  const read = () => apiFetchWithMeta<ConfigResult>(`${endpoint}/config`);
  let current = await read();
  assertGuild(request, context);
  if (!current.data?.config || typeof current.data.config !== "object") throw new Error("API-ul nu a returnat configurația serverului.");
  if (request.method === "save" && request.changes?.length) {
    const save = async () => {
      const merged = applyPanelChanges(current.data.config, request.changes!, metadata);
      const version = current.data.version ?? current.headers.get("etag")?.replace(/^W\//, "").replaceAll('"', "");
      if (version == null) throw new Error("Lipsește versiunea configurației. Nu s-a trimis salvarea.");
      assertGuild(request, context);
      return apiFetchWithMeta<ConfigResult>(`${endpoint}/config`, {
        method: "PUT",
        headers: { "If-Match": `"${String(version).replaceAll('"', "")}"` },
        body: JSON.stringify(merged),
      });
    };
    try {
      current = await save();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      current = await read();
      assertGuild(request, context);
      // Retry only the user's changed fields on the fresh version.
      current = await save();
    }
    assertGuild(request, context);
  }
  const snapshot = mapPanelSnapshot(request.defaults, current.data.config, metadata, bot);
  try {
    const logs = await apiFetchWithMeta<{ items: ModerationAuditLog[] }>(`${endpoint}/logs/audit?limit=20&offset=0`);
    assertGuild(request, context);
    snapshot.log = (Array.isArray(logs.data.items) ? logs.data.items : [])
      .filter((entry) => entry.guildId === request.guildId && Number.isFinite(Date.parse(entry.createdAt)))
      .map((entry) => {
        const presentation = presentAuditLog(entry);
        return { t: Date.parse(entry.createdAt), m: "audit", x: `${presentation.title}: ${presentation.details}`.slice(0, 160) };
      });
  } catch {
    snapshot.logError = "Jurnalul real nu a putut fi încărcat. Absența lui nu înseamnă că nu au existat modificări.";
  }
  assertGuild(request, context);
  return snapshot;
}
