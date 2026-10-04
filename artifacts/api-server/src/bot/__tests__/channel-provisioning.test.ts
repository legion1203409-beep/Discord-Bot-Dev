import { ChannelType, PermissionFlagsBits, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { defaultModerationConfig } from "../../moderation/config";
import { DEFAULT_VERIFICATION_CONFIG } from "../verification";
import { DEFAULT_TICKET_CONFIG } from "../ticket-config";
import { provisionActivityLogChannels, provisionGuildChannels, provisionModerationDestination } from "../channel-provisioning";

function channel(id: string, name: string, type: ChannelType) {
  const value = {
    id,
    name,
    type,
    parentId: null as string | null,
    setParent: vi.fn(async (parentId: string) => {
      value.parentId = parentId;
      return value;
    }),
    permissionOverwrites: {
      cache: new Map<string, { id: string; allow: { has: (permission: bigint) => boolean } }>(),
      edit: vi.fn(async (_roleId: string, _permissions: Record<string, boolean | null>, _options?: { reason?: string }) => value),
    },
  };
  return value;
}

describe("guild channel provisioning", () => {
  it("reuses configured and named channels, creates only missing destinations, and is repeatable", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>([
      ["configured-main", channel("configured-main", "unrelated-name", ChannelType.GuildText)],
      ["event-existing", channel("event-existing", "ora-umbrelor", ChannelType.GuildText)],
      ["mod-raid", channel("mod-raid", "mod-anti-raid", ChannelType.GuildText)],
      ["mod-spam", channel("mod-spam", "mod-anti-spam", ChannelType.GuildText)],
      ["mod-suspect", channel("mod-suspect", "mod-comportament-suspect", ChannelType.GuildText)],
      ["mod-ai", channel("mod-ai", "mod-ai", ChannelType.GuildText)],
      ["verify", channel("verify", "verificare", ChannelType.GuildText)],
      ["cat-staff", channel("cat-staff", "aplicare-staff", ChannelType.GuildCategory)],
      ["cat-partnership", channel("cat-partnership", "parteneriate", ChannelType.GuildCategory)],
      ["cat-help", channel("cat-help", "ajutor-raportare", ChannelType.GuildCategory)],
    ]);
    const create = vi.fn(async ({ name, type }: { name: string; type: ChannelType }) => {
      const created = channel(`created-${channels.size}`, name, type);
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-for-provisioning",
      channels: { fetch: vi.fn(async () => channels), create },
    } as unknown as Guild;

    const first = await provisionGuildChannels(guild, {
      channelConfig: { main: "configured-main", event: "event-existing" },
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: structuredClone(DEFAULT_VERIFICATION_CONFIG),
    });

    expect(first.reused.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "configured-main",
      "event-existing",
      "cat-staff",
      "cat-partnership",
      "cat-help",
      "mod-raid",
      "mod-spam",
      "mod-suspect",
      "mod-ai",
      "verify",
    ]));
    expect(first.created.map((entry) => entry.key)).toEqual(expect.arrayContaining([
      "eventTop",
      "bossTop",
      "council",
      "fratia",
      "moderation.audit.channelId",
    ]));
    expect(create).toHaveBeenCalledTimes(first.created.length);
    expect(channels.get(first.channelConfig.event!)?.parentId).toBe(
      first.created.find((entry) => entry.key === "category.gameplay")?.id,
    );
    expect(channels.get(first.verification.channelId)?.parentId).toBe(
      first.created.find((entry) => entry.key === "category.verification")?.id,
    );

    const second = await provisionGuildChannels(guild, {
      channelConfig: first.channelConfig,
      ticketConfig: first.ticketConfig,
      moderationConfig: first.moderationConfig,
      verification: first.verification,
    });
    expect(second.created).toEqual([]);
    expect(create).toHaveBeenCalledTimes(first.created.length);
  });

  it("creates only the selected provisioning category", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>();
    const create = vi.fn(async ({ name, type }: { name: string; type: ChannelType }) => {
      const created = channel(`created-${channels.size}`, name, type);
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-selected-category",
      channels: { fetch: vi.fn(async () => channels), create },
    } as unknown as Guild;

    const result = await provisionGuildChannels(guild, {
      categories: ["gameplay"],
      channelConfig: {},
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: structuredClone(DEFAULT_VERIFICATION_CONFIG),
    });

    expect(result.created.map((entry) => entry.key)).toEqual(expect.arrayContaining([
      "category.gameplay",
      "main",
      "event",
      "boss",
      "trader",
      "eventTop",
      "bossTop",
    ]));
    expect(result.created.map((entry) => entry.key)).not.toEqual(expect.arrayContaining([
      "category.admin",
      "category.security",
      "council",
      "fratia",
      "moderation.audit.channelId",
      "verification.channelId",
    ]));
    expect(result.created.every((entry) => entry.key === "category.gameplay" || [
      "main",
      "event",
      "boss",
      "trader",
      "eventTop",
      "bossTop",
    ].includes(entry.key))).toBe(true);
  });

  it("creates and reuses a dedicated daily statistics channel instead of using Cufere", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>([
      ["cufere", channel("cufere", "statistici-zilnice", ChannelType.GuildText)],
    ]);
    const create = vi.fn(async ({ name, type, parent }: { name: string; type: ChannelType; parent?: string }) => {
      const created = channel(`created-${channels.size}`, name, type);
      created.parentId = parent ?? null;
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-daily-stats",
      channels: { fetch: vi.fn(async () => channels), create },
      roles: {
        everyone: { id: "guild-daily-stats" },
        cache: new Map([
          ["guild-daily-stats", { id: "guild-daily-stats" }],
          ["bot-role", { id: "bot-role" }],
        ]),
      },
      members: { me: { roles: { highest: { id: "bot-role" } } } },
    } as unknown as Guild;
    const base = {
      channelConfig: { main: "cufere" },
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: structuredClone(DEFAULT_VERIFICATION_CONFIG),
    };

    const first = await provisionGuildChannels(guild, {
      ...base,
      categories: ["reports"],
      dailyStats: { channelId: "cufere" },
      permissions: {
        reports: {
          roleIds: ["guild-daily-stats"],
          readMessageHistory: true,
          sendMessages: false,
          rolePermissions: {
            "guild-daily-stats": { viewChannel: true, readMessageHistory: true, sendMessages: false },
          },
        },
      },
    });

    expect(first.dailyStatsChannelId).toBeDefined();
    expect(first.dailyStatsChannelId).not.toBe("cufere");
    expect(first.created.map((entry) => entry.key)).toEqual(["category.reports", "dailyStats.channelId"]);
    const reportChannel = channels.get(first.dailyStatsChannelId!);
    expect(reportChannel?.name).toBe("statistici-zilnice");
    expect(reportChannel?.parentId).toBe(first.created.find((entry) => entry.key === "category.reports")?.id);
    expect(reportChannel?.permissionOverwrites.edit).toHaveBeenCalledWith("guild-daily-stats", {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: false,
    }, expect.anything());
    expect(reportChannel?.permissionOverwrites.edit).toHaveBeenCalledWith("bot-role", {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: true,
    }, expect.anything());

    const second = await provisionGuildChannels(guild, {
      ...base,
      categories: ["reports"],
      dailyStats: { channelId: first.dailyStatsChannelId! },
      permissions: {
        reports: {
          roleIds: ["guild-daily-stats"],
          readMessageHistory: true,
          sendMessages: false,
          rolePermissions: {
            "guild-daily-stats": { viewChannel: true, readMessageHistory: true, sendMessages: false },
          },
        },
      },
    });

    expect(second.created).toEqual([]);
    expect(second.dailyStatsChannelId).toBe(first.dailyStatsChannelId);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("applies selected role visibility, history, and write permissions", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>();
    const create = vi.fn(async ({ name, type }: { name: string; type: ChannelType }) => {
      const created = channel(`created-${channels.size}`, name, type);
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-permissions",
      channels: { fetch: vi.fn(async () => channels), create },
      roles: {
        cache: new Map([
          ["role-staff", { id: "role-staff" }],
          ["role-old", { id: "role-old" }],
          ["role-unrelated", { id: "role-unrelated" }],
          ["bot-role", { id: "bot-role" }],
        ]),
        everyone: { id: "everyone" },
      },
      members: {
        me: { roles: { highest: { id: "bot-role" } } },
      },
    } as unknown as Guild;

    await provisionGuildChannels(guild, {
      categories: ["gameplay"],
      permissions: {
        gameplay: {
          roleIds: ["role-staff"],
          readMessageHistory: false,
          sendMessages: false,
        },
      },
      previousPermissions: {
        gameplay: {
          roleIds: ["role-old"],
          readMessageHistory: true,
          sendMessages: true,
        },
      },
      channelConfig: {},
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: structuredClone(DEFAULT_VERIFICATION_CONFIG),
    });

    const channelCalls = [...channels.values()].map((entry) => entry.permissionOverwrites.edit.mock.calls);
    expect(channelCalls).toHaveLength(7);
    expect(channelCalls[0]).toEqual(expect.arrayContaining([
      ["everyone", { ViewChannel: false, ReadMessageHistory: false, SendMessages: false }, expect.anything()],
      ["role-old", { ViewChannel: null, ReadMessageHistory: null, SendMessages: null }, expect.anything()],
      ["role-staff", { ViewChannel: true, ReadMessageHistory: false, SendMessages: false }, expect.anything()],
      ["bot-role", { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }, expect.anything()],
    ]));
    expect(channelCalls[0]?.map(([roleId]) => roleId)).not.toContain("role-unrelated");
  });

  it("applies independent per-role access settings", async () => {
    const createdChannels = new Map<string, ReturnType<typeof channel>>();
    const create = vi.fn(async ({ name, type }: { name: string; type: ChannelType }) => {
      const created = channel(`new-${createdChannels.size}`, name, type);
      createdChannels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-profile",
      channels: { fetch: vi.fn(async () => createdChannels), create },
      roles: {
        cache: new Map([["role-visitor", { id: "role-visitor" }], ["role-staff", { id: "role-staff" }], ["bot-role", { id: "bot-role" }]]),
        everyone: { id: "everyone" },
      },
      members: { me: { roles: { highest: { id: "bot-role" } } } },
    } as unknown as Guild;
    await provisionGuildChannels(guild, {
      categories: ["gameplay"],
      permissions: {
        gameplay: {
          roleIds: ["role-visitor", "role-staff"],
          readMessageHistory: true,
          sendMessages: true,
          rolePermissions: {
            "role-visitor": { viewChannel: true, readMessageHistory: true, sendMessages: false },
            "role-staff": { viewChannel: true, readMessageHistory: true, sendMessages: true },
          },
        },
      },
      channelConfig: {},
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: structuredClone(DEFAULT_VERIFICATION_CONFIG),
    });
    const edits = [...createdChannels.values()][0].permissionOverwrites.edit.mock.calls;
    expect(edits).toContainEqual(["role-visitor", { ViewChannel: true, ReadMessageHistory: true, SendMessages: false }, expect.anything()]);
    expect(edits).toContainEqual(["role-staff", { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }, expect.anything()]);
  });

  it("creates private activity-log channels once and reuses them on retries", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>();
    const create = vi.fn(async ({ name, type, parent }: { name: string; type: ChannelType; parent?: string }) => {
      const created = channel(`activity-${channels.size}`, name, type);
      created.parentId = parent ?? null;
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-activity-log",
      channels: { fetch: vi.fn(async () => channels), create },
      roles: {
        everyone: { id: "everyone-role" },
        cache: new Map([
          ["everyone-role", { id: "everyone-role" }],
          ["role-staff", { id: "role-staff" }],
          ["role-new", { id: "role-new" }],
          ["bot-role", { id: "bot-role" }],
        ]),
      },
      members: { me: { roles: { highest: { id: "bot-role" } } } },
    } as unknown as Guild;
    const activityLog = {
      ...structuredClone(defaultModerationConfig.activityLog),
      enabled: true,
      roleIds: ["role-staff"],
    };

    const first = await provisionActivityLogChannels(guild, { activityLog });
    expect(first.created).toHaveLength(8);
    expect(first.created[0]).toMatchObject({ key: "activityLog.category", type: "category" });
    expect(Object.values(first.activityLog.channelIds).filter(Boolean)).toHaveLength(7);
    const categoryId = first.activityLog.categoryId;
    expect([...channels.values()].filter((entry) => entry.type === ChannelType.GuildText)
      .every((entry) => entry.parentId === categoryId)).toBe(true);
    for (const entry of channels.values()) {
      expect(entry.permissionOverwrites.edit).toHaveBeenCalledWith(
        "everyone-role",
        { ViewChannel: false, ReadMessageHistory: false, SendMessages: false },
        expect.anything(),
      );
      expect(entry.permissionOverwrites.edit).toHaveBeenCalledWith(
        "role-staff",
        { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
        expect.anything(),
      );
    }

    const second = await provisionActivityLogChannels(guild, {
      activityLog: first.activityLog,
      previousRoleIds: ["role-staff"],
    });
    expect(second.created).toEqual([]);
    expect(second.reused).toHaveLength(8);
    expect(create).toHaveBeenCalledTimes(8);

    const membersChannelId = second.activityLog.channelIds.members!;
    const third = await provisionActivityLogChannels(guild, {
      activityLog: {
        ...second.activityLog,
        categories: { ...second.activityLog.categories, members: false },
        roleIds: ["role-new"],
      },
      previousRoleIds: ["role-staff"],
    });
    expect(create).toHaveBeenCalledTimes(8);
    expect(channels.get(membersChannelId)!.permissionOverwrites.edit).toHaveBeenCalledWith(
      "role-staff",
      { ViewChannel: null, ReadMessageHistory: null, SendMessages: null },
      expect.anything(),
    );
    expect(channels.get(membersChannelId)!.permissionOverwrites.edit).toHaveBeenCalledWith(
      "role-new",
      { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
      expect.anything(),
    );
    expect(third.activityLog.channelIds.members).toBe(membersChannelId);
  });

  it("creates the requested activity-log channel in one private category and reuses it", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>();
    const create = vi.fn(async ({ name, type, parent }: { name: string; type: ChannelType; parent?: string }) => {
      const created = channel(`activity-${channels.size}`, name, type);
      created.parentId = parent ?? null;
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-activity-single-target",
      channels: { fetch: vi.fn(async () => channels), create },
      roles: {
        everyone: { id: "everyone-role" },
        cache: new Map([["everyone-role", { id: "everyone-role" }], ["role-staff", { id: "role-staff" }]]),
      },
      members: { me: { roles: { highest: { id: "bot-role" } } } },
    } as unknown as Guild;

    const result = await provisionActivityLogChannels(guild, {
      activityLog: {
        ...structuredClone(defaultModerationConfig.activityLog),
        categories: { ...defaultModerationConfig.activityLog.categories, messages: true },
        roleIds: ["role-staff"],
      },
      onlyCategories: ["messages"],
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: "📋・JURNAL SERVER",
      type: ChannelType.GuildCategory,
    }));
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: "jurnal-mesaje",
      type: ChannelType.GuildText,
      parent: result.activityLog.categoryId,
    }));
    expect(result.created).toHaveLength(2);
    expect(result.created).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "activityLog.category", type: "category" }),
      expect.objectContaining({ key: "activityLog.messages", type: "text" }),
    ]));
    expect(result.activityLog.categoryId).toBeTruthy();

    const category = channels.get(result.activityLog.categoryId!)!;
    const messagesChannel = channels.get(result.activityLog.channelIds.messages!)!;
    for (const privateChannel of [category, messagesChannel]) {
      expect(privateChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        "everyone-role",
        { ViewChannel: false, ReadMessageHistory: false, SendMessages: false },
        expect.anything(),
      );
      expect(privateChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        "role-staff",
        { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
        expect.anything(),
      );
    }

    const second = await provisionActivityLogChannels(guild, {
      activityLog: {
        ...result.activityLog,
        categories: { ...result.activityLog.categories, security: true },
      },
      previousRoleIds: ["role-staff"],
      onlyCategories: ["security"],
    });
    expect(create).toHaveBeenCalledTimes(3);
    expect(second.created).toHaveLength(1);
    expect(second.created[0]).toMatchObject({ key: "activityLog.security", type: "text" });
    expect(channels.get(second.activityLog.channelIds.security!)!.parentId).toBe(category.id);
    expect([...channels.values()].filter((entry) => entry.type === ChannelType.GuildCategory)).toHaveLength(1);
  });

  it("rejects @everyone rather than making the private activity-log channels public", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>();
    const guild = {
      id: "guild-activity-everyone",
      channels: {
        fetch: vi.fn(async () => channels),
        create: vi.fn(),
      },
      roles: { everyone: { id: "guild-activity-everyone" }, cache: new Map() },
    } as unknown as Guild;
    await expect(provisionActivityLogChannels(guild, {
      activityLog: {
        ...structuredClone(defaultModerationConfig.activityLog),
        enabled: true,
        roleIds: ["guild-activity-everyone"],
      },
    })).rejects.toThrow("@everyone");
  });

  it("creates the requested moderation destination in a staff-only category and reuses it", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>([
      ["public-info", channel("public-info", "general", ChannelType.GuildText)],
    ]);
    const create = vi.fn(async ({ name, type, parent }: { name: string; type: ChannelType; parent?: string }) => {
      const created = channel(`created-${channels.size}`, name, type);
      created.parentId = parent ?? null;
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-moderation-target",
      channels: { fetch: vi.fn(async () => channels), create },
      roles: {
        everyone: { id: "everyone-role" },
        cache: new Map([
          ["everyone-role", { id: "everyone-role" }],
          ["role-staff", { id: "role-staff" }],
          ["bot-role", { id: "bot-role" }],
        ]),
      },
      members: { me: { roles: { highest: { id: "bot-role" } } } },
    } as unknown as Guild;
    const moderationConfig = structuredClone(defaultModerationConfig);
    moderationConfig.permissions.staffRoleIds = ["role-staff"];
    const permission = { roleIds: ["role-staff"], readMessageHistory: true, sendMessages: false };

    const first = await provisionModerationDestination(guild, {
      moderationConfig,
      destination: "autoMod.logChannelId",
      permission,
      previousPermission: permission,
    });

    expect(first.created).toBe(true);
    expect(first.channel).toMatchObject({ key: "autoMod.logChannelId", name: "mod-automod" });
    expect(first.moderationConfig.autoMod.logChannelId).toBe(first.channel.id);
    expect(first.moderationConfig.antiFlood.logChannelId).toBeNull();
    expect(first.moderationConfig.antiSpam.logChannelId).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: "🧹・MESAJE FILTRATE",
      type: ChannelType.GuildCategory,
    }));
    const categoryId = channels.get(first.channel.id)!.parentId;
    expect(categoryId).toBeTruthy();
    expect(create).toHaveBeenNthCalledWith(2, {
      name: "mod-automod",
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: expect.any(Array),
    });
    expect(channels.get("public-info")!.permissionOverwrites.edit).not.toHaveBeenCalled();
    expect(channels.get(first.channel.id)!.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone-role",
      { ViewChannel: false, ReadMessageHistory: false, SendMessages: false },
      expect.anything(),
    );
    expect(channels.get(first.channel.id)!.permissionOverwrites.edit).toHaveBeenCalledWith(
      "role-staff",
      { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
      expect.anything(),
    );
    expect(channels.get(categoryId!)!.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone-role",
      { ViewChannel: false, ReadMessageHistory: false, SendMessages: false },
      expect.anything(),
    );
    expect(channels.get(categoryId!)!.permissionOverwrites.edit).toHaveBeenCalledWith(
      "role-staff",
      { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
      expect.anything(),
    );

    const second = await provisionModerationDestination(guild, {
      moderationConfig: first.moderationConfig,
      destination: "antiFlood.logChannelId",
      permission,
      previousPermission: permission,
    });
    expect(second.created).toBe(true);
    expect(second.channel.name).toBe("mod-anti-flood");
    expect(create).toHaveBeenCalledTimes(3);
    expect(channels.get(second.channel.id)!.parentId).toBe(categoryId);
    expect([...channels.values()].filter((entry) => entry.type === ChannelType.GuildCategory)).toHaveLength(1);
  });

  it("does not create moderation channels when no staff role is configured", async () => {
    const create = vi.fn();
    const guild = {
      id: "guild-moderation-no-staff",
      channels: { fetch: vi.fn(async () => new Map()), create },
      roles: { everyone: { id: "everyone-role" }, cache: new Map() },
    } as unknown as Guild;

    await expect(provisionModerationDestination(guild, {
      moderationConfig: structuredClone(defaultModerationConfig),
      destination: "autoMod.logChannelId",
    })).rejects.toThrow("Configurează cel puțin un rol staff");
    expect(create).not.toHaveBeenCalled();
  });

  it("removes only view access from unconfigured roles on a reused moderation category and destination", async () => {
    const category = channel("filtered-category", "🧹・MESAJE FILTRATE", ChannelType.GuildCategory);
    const destination = channel("existing-automod", "mod-automod", ChannelType.GuildText);
    const viewGrant = {
      id: "role-outsider",
      allow: { has: (permission: bigint) => permission === PermissionFlagsBits.ViewChannel },
    };
    const sendOnlyGrant = {
      id: "role-unrelated",
      allow: { has: (permission: bigint) => permission === PermissionFlagsBits.SendMessages },
    };
    category.permissionOverwrites.cache.set(viewGrant.id, viewGrant);
    category.permissionOverwrites.cache.set(sendOnlyGrant.id, sendOnlyGrant);
    destination.permissionOverwrites.cache.set(viewGrant.id, viewGrant);
    destination.permissionOverwrites.cache.set(sendOnlyGrant.id, sendOnlyGrant);
    const channels = new Map([
      [category.id, category],
      [destination.id, destination],
    ]);
    const create = vi.fn();
    const guild = {
      id: "guild-moderation-existing-category",
      channels: { fetch: vi.fn(async () => channels), create },
      roles: {
        everyone: { id: "everyone-role" },
        cache: new Map([
          ["everyone-role", { id: "everyone-role" }],
          ["role-staff", { id: "role-staff" }],
          ["role-outsider", { id: "role-outsider" }],
          ["role-unrelated", { id: "role-unrelated" }],
          ["bot-role", { id: "bot-role" }],
        ]),
      },
      members: { me: { id: "bot-user", roles: { highest: { id: "bot-role" } } } },
    } as unknown as Guild;
    const moderationConfig = structuredClone(defaultModerationConfig);
    moderationConfig.permissions.staffRoleIds = ["role-staff"];
    const permission = { roleIds: ["role-staff"], readMessageHistory: true, sendMessages: false };

    const result = await provisionModerationDestination(guild, {
      moderationConfig,
      destination: "autoMod.logChannelId",
      permission,
      previousPermission: permission,
    });

    expect(result.created).toBe(false);
    expect(create).not.toHaveBeenCalled();
    for (const privateChannel of [category, destination]) {
      expect(privateChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        "role-outsider",
        { ViewChannel: false },
        expect.objectContaining({ reason: expect.stringContaining("doar rolurile staff") }),
      );
      expect(privateChannel.permissionOverwrites.edit).not.toHaveBeenCalledWith(
        "role-unrelated",
        expect.anything(),
        expect.anything(),
      );
    }
  });
});