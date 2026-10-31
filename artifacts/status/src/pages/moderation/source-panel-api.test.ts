import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../hooks/use-moderation-api", () => ({
  apiFetchWithMeta: transport.request,
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { ApiError } from "../../hooks/use-moderation-api";
import { handleSourcePanelRequest } from "./source-panel-api";
const guildId = "123456789";
const context = { activeGuildId: guildId, authorizedGuildIds: [guildId, "987654321"], getActiveGuildId: () => guildId };
const defaults = { automod: { on: false, f: {}, s: { words: { on: false, f: { list: [] } } } } };
const current = () => ({ autoMod: { enabled: false, forbiddenWords: ["current"], wordFilter: { enabled: true, action: "none" } }, unrelated: "preserved" });
const response = (data: unknown) => ({ data, headers: new Headers({ etag: '"7"' }) });
describe("original panel authenticated transport", () => {
  beforeEach(() => {
    transport.request.mockReset();
    transport.request.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith("/metadata")) return response({ roles: [], channels: [] });
      if (path.endsWith("/bot-control")) return response({});
      if (path.includes("/logs/audit")) return response({ items: [] });
      if (options?.method === "PUT") return response({ version: 8, config: JSON.parse(String(options.body)) });
      return response({ version: 7, config: current() });
    });
  });
  it("rejects a different or unauthorized guild before any request", async () => {
    await expect(handleSourcePanelRequest({ method: "save", guildId: "987654321", defaults }, context)).rejects.toThrow("nu aparține");
    await expect(handleSourcePanelRequest({ method: "loadOther", guildId: "555555555", defaults }, context)).rejects.toThrow("nu este autorizat");
    expect(transport.request).not.toHaveBeenCalled();
  });
  it("saves with the current ETag and preserves unrelated keys", async () => {
    await handleSourcePanelRequest({ method: "save", guildId, defaults, changes: [{ m: "automod", s: "words", k: "list", value: ["new"] }] }, context);
    const [, options] = transport.request.mock.calls.find(([, opts]) => opts?.method === "PUT")!;
    expect(options.headers["If-Match"]).toBe('"7"');
    expect(JSON.parse(options.body)).toMatchObject({ unrelated: "preserved", autoMod: { forbiddenWords: ["new"] } });
  });
  it("re-reads and reapplies only changed fields on one stale-version conflict", async () => {
    let writes = 0;
    transport.request.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith("/metadata") || path.endsWith("/bot-control")) return response({});
      if (path.includes("/logs/audit")) return response({ items: [] });
      if (options?.method === "PUT") {
        if (++writes === 1) throw new ApiError(409, "conflict");
        return response({ version: 9, config: JSON.parse(String(options.body)) });
      }
      return response({ version: writes ? 8 : 7, config: { ...current(), unrelated: writes ? "remote edit" : "preserved" } });
    });
    await handleSourcePanelRequest({ method: "save", guildId, defaults, changes: [{ m: "automod", s: "words", k: "list", value: ["new"] }] }, context);
    const puts = transport.request.mock.calls.filter(([, opts]) => opts?.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1]![1].headers["If-Match"]).toBe('"8"');
    expect(JSON.parse(puts[1]![1].body).unrelated).toBe("remote edit");
  });
  it("rechecks the live guild after loading and never writes after a switch", async () => {
    let active: string | null = guildId;
    transport.request.mockImplementation(async (path: string) => {
      if (path.endsWith("/config")) { active = "987654321"; return response({ config: current(), version: 7 }); }
      return response({});
    });
    await expect(handleSourcePanelRequest({ method: "save", guildId, defaults, changes: [{ m: "automod", s: "words", k: "list", value: ["new"] }] },
      { ...context, getActiveGuildId: () => active })).rejects.toThrow("s-a schimbat");
    expect(transport.request.mock.calls.some(([, opts]) => opts?.method === "PUT")).toBe(false);
  });
  it("does not pretend that the whole panel was reset", async () => {
    await expect(handleSourcePanelRequest({ method: "reset", guildId, defaults }, context)).rejects.toThrow("Nu s-a resetat nimic");
    expect(transport.request).not.toHaveBeenCalled();
  });
});
