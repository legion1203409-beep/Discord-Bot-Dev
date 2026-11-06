import { ChannelType, type Guild } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultModerationConfig } from "../../moderation/config";
import { CHANNEL_NAME_CATALOG, cleanChannelName, provisionActivityLogChannels, provisionModerationDestination, setChannelNamesLoader } from "../channel-provisioning";
import { normalizeChannelNames, suggestChannelNames } from "../channel-names";

function channel(id: string, name: string, type: ChannelType) {
  const value = {
    id, name, type, parentId: null as string | null,
    setParent: vi.fn(async (parentId: string) => { value.parentId = parentId; return value; }),
    permissionOverwrites: { cache: new Map(), edit: vi.fn(async () => value) },
  };
  return value;
}

function fakeGuild(existing: Array<ReturnType<typeof channel>> = []) {
  const channels = new Map(existing.map((item) => [item.id, item]));
  const create = vi.fn(async ({ name, type, parent }: { name: string; type: ChannelType; parent?: string }) => {
    const created = channel(`new-${channels.size}`, name, type);
    created.parentId = parent ?? null;
    channels.set(created.id, created);
    return created;
  });
  const guild = {
    id: "guild-names", channels: { fetch: vi.fn(async () => channels), create },
    roles: { everyone: { id: "everyone" }, cache: new Map([["everyone", { id: "everyone" }], ["bot", { id: "bot" }]]) },
    members: { me: { roles: { highest: { id: "bot" } } } },
  } as unknown as Guild;
  return { guild, create, channels };
}

afterEach(() => setChannelNamesLoader(async () => ({})));

describe("numele pe care Discord le acceptă", () => {
  it("canalele text: litere mici, cratimă în loc de spații, fără simboluri; emoji și diacritice rămân", () => {
    expect(cleanChannelName("📜・Cronica Scrisorilor!", "text")).toBe("📜・cronica-scrisorilor");
    expect(cleanChannelName("  Sala   Tronului -- @everyone ", "text")).toBe("sala-tronului-everyone");
    expect(cleanChannelName("Țara Cenușii", "text")).toBe("țara-cenușii");
    expect(cleanChannelName("x".repeat(150), "text")).toHaveLength(100);
  });
  it("categoriile păstrează majusculele și spațiile", () => {
    expect(cleanChannelName("🏰・SALA   TRONULUI", "category")).toBe("🏰・SALA TRONULUI");
  });
  it("setările păstrează doar canalele cunoscute și numele curățate", () => {
    const settings = normalizeChannelNames({ theme: " medieval ", names: { "activityLog.messages": "Cronica Scrisorilor", "nu.exista": "x", "category.gameplay": "  ", main: 5 } });
    expect(settings).toEqual({ theme: "medieval", names: { "activityLog.messages": "cronica-scrisorilor" } });
  });
  it("catalogul are fiecare canal o singură dată, cu numele de bază și rolul lui", () => {
    const keys = CHANNEL_NAME_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["category.gameplay", "main", "tickets.categories.staff", "moderation.audit.channelId", "verification.channelId", "dailyStats.channelId", "activityLog.category", "activityLog.messages"]));
    expect(CHANNEL_NAME_CATALOG.every((entry) => entry.defaultName && entry.purpose)).toBe(true);
  });
});

describe("crearea canalelor cu numele alese", () => {
  it("jurnalele se creează cu numele tematice", async () => {
    setChannelNamesLoader(async () => ({ "activityLog.category": "📜・CRONICILE REGATULUI", "activityLog.messages": "📜・cronica-scrisorilor" }));
    const { guild, create } = fakeGuild();
    const activityLog = { ...structuredClone(defaultModerationConfig.activityLog), enabled: true };
    await provisionActivityLogChannels(guild, { activityLog });
    const names = create.mock.calls.map(([options]) => options.name);
    expect(names).toContain("📜・CRONICILE REGATULUI");
    expect(names).toContain("📜・cronica-scrisorilor");
    // The others keep their built-in names.
    expect(names).toContain("jurnal-membri");
  });

  it("un canal care există deja cu numele de bază nu se dublează", async () => {
    setChannelNamesLoader(async () => ({ "moderation.audit.channelId": "📜・registrul-strajerilor" }));
    const { guild, create } = fakeGuild([channel("cat-admin", "🛠️・ADMINISTRAȚIE", ChannelType.GuildCategory), channel("old-audit", "mod-audit", ChannelType.GuildText)]);
    const result = await provisionModerationDestination(guild, { moderationConfig: structuredClone(defaultModerationConfig), destination: "audit.channelId" });
    expect(create).not.toHaveBeenCalled();
    expect(result.channel.id).toBe("old-audit");
  });

  it("dacă setările nu se pot citi, se folosesc numele de bază", async () => {
    setChannelNamesLoader(async () => { throw new Error("db offline"); });
    const { guild, create } = fakeGuild();
    await provisionModerationDestination(guild, { moderationConfig: structuredClone(defaultModerationConfig), destination: "audit.channelId" });
    expect(create.mock.calls.map(([options]) => options.name)).toEqual(["🛠️・ADMINISTRAȚIE", "mod-audit"]);
  });
});

describe("propunerile AI", () => {
  it("fără cheia OpenAI spune clar că trebuie scrise de mână", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(suggestChannelNames("medieval")).rejects.toThrow("Poți scrie numele de mână");
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});
