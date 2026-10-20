import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonStyle } from "discord.js";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  addRole: vi.fn(),
}));

vi.mock("../db", () => ({
  loadVerificationConfig: mocks.loadConfig,
  saveVerificationConfig: mocks.saveConfig,
}));

import {
  publishVerificationPanel,
  VerificationPanelPersistenceError,
  verificationPanel,
  verifyMember,
} from "../verification";
import { getVerificationOAuthUrl } from "../../moderation/oauth";

describe("Discord member verification", () => {
  const guildId = "123456789";
  const userId = "987654321";
  const roleId = "555555555";
  const originalVerificationOrigin = process.env.MODERATION_WEB_ORIGIN;

  function makeClient({
    role = { id: roleId, managed: false, position: 2 },
    botPosition = 10,
    memberRoleIds = [],
  }: {
    role?: { id: string; managed: boolean; position: number } | null;
    botPosition?: number;
    memberRoleIds?: string[];
  } = {}) {
    const member = {
      roles: {
        cache: new Map(memberRoleIds.map((id) => [id, { id }])),
        add: mocks.addRole,
      },
    };
    const botMember = {
      permissions: { has: vi.fn(() => true) },
      roles: { highest: { position: botPosition } },
    };
    const guild = {
      members: {
        fetch: vi.fn(async (id?: string) => id === userId ? member : botMember),
        me: botMember,
        fetchMe: vi.fn(async () => botMember),
      },
      roles: {
        fetch: vi.fn(async () => role),
      },
    };
    return { client: { guilds: { fetch: vi.fn(async () => guild) } }, member, botMember, guild };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MODERATION_WEB_ORIGIN = "https://codelinked.app";
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId });
    mocks.saveConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalVerificationOrigin === undefined) delete process.env.MODERATION_WEB_ORIGIN;
    else process.env.MODERATION_WEB_ORIGIN = originalVerificationOrigin;
  });

  it("awards the configured role to a member who is not verified yet", async () => {
    const { client, member } = makeClient();

    await expect(verifyMember(client as never, guildId, userId)).resolves.toBe("verified");
    expect(member.roles.add).toHaveBeenCalledWith(
      { id: roleId, managed: false, position: 2 },
      "Verificare confirmată prin site",
    );
  });

  it("rejects verification when the configured role no longer exists", async () => {
    const { client } = makeClient({ role: null });

    await expect(verifyMember(client as never, guildId, userId)).rejects.toThrow("Rolul de verificare nu mai există.");
    expect(mocks.addRole).not.toHaveBeenCalled();
  });

  it("rejects verification when the bot cannot manage the configured role", async () => {
    const { client } = makeClient({ botPosition: 2 });

    await expect(verifyMember(client as never, guildId, userId)).rejects.toThrow(
      "Rolul de verificare trebuie să fie sub rolul botului și să nu fie managed.",
    );
    expect(mocks.addRole).not.toHaveBeenCalled();
  });

  it("keeps disabled verification round-trips offline and write-free", async () => {
    const input = { ...enabledVerificationConfig(), enabled: false, channelId: "", roleId: "" };
    const client = { user: null, guilds: { fetch: vi.fn() } };

    await expect(publishVerificationPanel(client as never, guildId, input)).resolves.toMatchObject({ enabled: false });
    expect(client.guilds.fetch).not.toHaveBeenCalled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it("publishes a Link button that opens the public Discord authorization flow", () => {
    const payload = verificationPanel(enabledVerificationConfig(), getVerificationOAuthUrl(guildId));
    const button = payload.components[0]!.components[0]!.toJSON() as {
      style: number;
      url?: string;
      custom_id?: string;
    };
    const buttonUrl = new URL(button.url!);

    expect(button.style).toBe(ButtonStyle.Link);
    expect(buttonUrl.origin).toBe("https://codelinked.app");
    expect(buttonUrl.pathname).toBe("/api/moderation/oauth/discord");
    expect(buttonUrl.searchParams.get("verification")).toBe("1");
    expect(buttonUrl.searchParams.get("guildId")).toBe(guildId);
    expect(button.custom_id).toBeUndefined();
  });

  it("reuses the bot's existing panel after its first persistence attempt failed", async () => {
    const history = new Map<string, ReturnType<typeof makePanelMessage>>();
    const send = vi.fn(async () => {
      const message = makePanelMessage("panel-message");
      history.set(message.id, message);
      return message;
    });
    const channel = makePublishChannel(history, send);
    const client = makePublishClient(channel);
    mocks.saveConfig.mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValue(undefined);
    const config = enabledVerificationConfig();

    await expect(publishVerificationPanel(client as never, guildId, config))
      .rejects.toBeInstanceOf(VerificationPanelPersistenceError);
    const retry = await publishVerificationPanel(client as never, guildId, { ...config, panelMessageId: "" });

    expect(retry.panelMessageId).toBe("panel-message");
    expect(send).toHaveBeenCalledOnce();
    expect(history.get("panel-message")?.edit).toHaveBeenCalledOnce();
    expect(mocks.saveConfig).toHaveBeenCalledTimes(2);
  });

  it("fails closed on uncertain channel history without sending or editing a message", async () => {
    const send = vi.fn();
    const channel = {
      isTextBased: () => true,
      send,
      messages: { fetch: vi.fn().mockRejectedValue(new Error("missing read history permission")) },
    };
    const client = makePublishClient(channel);

    await expect(publishVerificationPanel(client as never, guildId, enabledVerificationConfig()))
      .rejects.toThrow("Read Message History");
    expect(send).not.toHaveBeenCalled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it("fails closed when multiple bot-authored verification panels are found", async () => {
    const first = makePanelMessage("first-panel");
    const second = makePanelMessage("second-panel");
    const history = new Map([[first.id, first], [second.id, second]]);
    const send = vi.fn();
    const channel = makePublishChannel(history, send);
    const client = makePublishClient(channel);

    await expect(publishVerificationPanel(client as never, guildId, enabledVerificationConfig()))
      .rejects.toThrow("multiple bot-authored verification panels");
    expect(send).not.toHaveBeenCalled();
    expect(first.edit).not.toHaveBeenCalled();
    expect(second.edit).not.toHaveBeenCalled();
  });

  it("fails closed when channel history exceeds the bounded reconciliation scan", async () => {
    let pageNumber = 0;
    const messagesFetch = vi.fn(async () => {
      const page = new Map<string, ReturnType<typeof makePanelMessage>>();
      for (let index = 0; index < 100; index += 1) {
        const message = makePanelMessage(`history-${pageNumber}-${index}`, "admin-user");
        message.components = [];
        message.createdTimestamp = pageNumber * 100 + index;
        page.set(message.id, message);
      }
      pageNumber += 1;
      return page;
    });
    const send = vi.fn();
    const channel = { isTextBased: () => true, send, messages: { fetch: messagesFetch } };
    const client = makePublishClient(channel);

    await expect(publishVerificationPanel(client as never, guildId, enabledVerificationConfig()))
      .rejects.toThrow("exceeds the safe scan limit");
    expect(messagesFetch).toHaveBeenCalledTimes(5);
    expect(send).not.toHaveBeenCalled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it("does not edit an administrator's verification_start message", async () => {
    const adminMessage = makePanelMessage("admin-message", "admin-user");
    const history = new Map([[adminMessage.id, adminMessage]]);
    const send = vi.fn(async () => makePanelMessage("bot-panel"));
    const channel = makePublishChannel(history, send, { savedIdMessage: adminMessage });
    const client = makePublishClient(channel);

    const result = await publishVerificationPanel(client as never, guildId, {
      ...enabledVerificationConfig(),
      panelMessageId: adminMessage.id,
    });

    expect(result.panelMessageId).toBe("bot-panel");
    expect(adminMessage.edit).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  it("recognizes and edits an existing direct-link panel in place", async () => {
    const existingPanel = makePanelMessage(
      "link-panel",
      "bot",
      getVerificationOAuthUrl(guildId),
    );
    const history = new Map([[existingPanel.id, existingPanel]]);
    const send = vi.fn();
    const channel = makePublishChannel(history, send, { savedIdMessage: existingPanel });
    const client = makePublishClient(channel);

    const result = await publishVerificationPanel(client as never, guildId, {
      ...enabledVerificationConfig(),
      panelMessageId: existingPanel.id,
    });

    expect(result.panelMessageId).toBe(existingPanel.id);
    expect(existingPanel.edit).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("serializes concurrent first publications to avoid duplicate panels", async () => {
    const history = new Map<string, ReturnType<typeof makePanelMessage>>();
    const send = vi.fn(async () => {
      const message = makePanelMessage("single-panel");
      history.set(message.id, message);
      return message;
    });
    const channel = makePublishChannel(history, send);
    const client = makePublishClient(channel);

    const results = await Promise.all([
      publishVerificationPanel(client as never, guildId, enabledVerificationConfig()),
      publishVerificationPanel(client as never, guildId, enabledVerificationConfig()),
    ]);

    expect(results.map((result) => result.panelMessageId)).toEqual(["single-panel", "single-panel"]);
    expect(send).toHaveBeenCalledOnce();
    expect(history.get("single-panel")?.edit).toHaveBeenCalledOnce();
    expect(mocks.saveConfig).toHaveBeenCalledTimes(2);
  });
});

function enabledVerificationConfig() {
  return {
    enabled: true,
    channelId: "222222222",
    roleId: "333333333",
    title: "Verification",
    message: "Verify your account",
    buttonLabel: "Verify",
    buttonEmoji: "✅",
    successMessage: "Verified",
    alreadyVerifiedMessage: "Already verified",
    imageUrl: "",
    thumbnailUrl: "",
    panelMessageId: "",
  };
}

function makePanelMessage(id: string, authorId = "bot", buttonUrl?: string) {
  return {
    id,
    author: { id: authorId },
    components: [{
      components: [buttonUrl ? { url: buttonUrl } : { customId: "verification_start" }],
    }],
    createdTimestamp: Number(id === "panel-message" ? 10 : 20),
    edit: vi.fn().mockResolvedValue(undefined),
  };
}

function makePublishChannel(
  history: Map<string, ReturnType<typeof makePanelMessage>>,
  send: ReturnType<typeof vi.fn>,
  options: { savedIdMessage?: ReturnType<typeof makePanelMessage> } = {},
) {
  return {
    isTextBased: () => true,
    send,
    messages: {
      fetch: vi.fn(async (query: string | { limit: number; before?: string }) => {
        if (typeof query === "string") {
          if (options.savedIdMessage?.id === query) return options.savedIdMessage;
          const message = history.get(query);
          if (message) return message;
          throw Object.assign(new Error("Unknown Message"), { code: 10008 });
        }
        return new Map(history);
      }),
    },
  };
}

function makePublishClient(channel: unknown) {
  return {
    user: { id: "bot" },
    guilds: {
      fetch: vi.fn().mockResolvedValue({
        channels: { fetch: vi.fn().mockResolvedValue(channel) },
      }),
    },
  };
}