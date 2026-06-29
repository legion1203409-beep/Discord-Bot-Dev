import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock discord.js — only PermissionFlagsBits is used at runtime ─────────────
vi.mock("discord.js", () => ({
  PermissionFlagsBits: { ModerateMembers: 268435456n },
}));

// ── Mock logger so test output stays clean ────────────────────────────────────
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks are registered
import { containsSwear, handleToxicity } from "../oracle-guard";
import type { Client, Message } from "discord.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake Message that covers every property handleToxicity reads.
 * Each call to makeMessage should use a unique authorId so offense records
 * accumulated across tests don't skew the escalation step.
 */
function makeMessage(opts: {
  botId: string;
  content: string;
  authorId: string;
  isMentioned?: boolean;
  hasPermission?: boolean;
  memberManageable?: boolean;
  timeoutFn?: ReturnType<typeof vi.fn>;
}) {
  const {
    botId,
    content,
    authorId,
    isMentioned = true,
    hasPermission = true,
    memberManageable = true,
  } = opts;

  const mockTimeout = opts.timeoutFn ?? vi.fn().mockResolvedValue(undefined);

  const member = {
    manageable: memberManageable,
    timeout: mockTimeout,
  };

  const botMember = {
    permissions: { has: vi.fn().mockReturnValue(hasPermission) },
  };

  const mockReply = vi.fn().mockResolvedValue(undefined);

  const msg = {
    mentions: { users: { has: vi.fn().mockReturnValue(isMentioned) } },
    content,
    author: { id: authorId },
    member,
    guild: {
      members: {
        me: botMember,
        fetch: vi.fn().mockResolvedValue(member),
      },
      ownerId: "guild-owner-id",
    },
    reply: mockReply,
    _timeout: mockTimeout,
    _reply: mockReply,
    _botMember: botMember,
  };

  return msg;
}

function makeClient(botId: string) {
  return { user: { id: botId } } as unknown as Client;
}

// ─── containsSwear ─────────────────────────────────────────────────────────────

describe("containsSwear", () => {
  it("returns false for clean, respectful text", () => {
    expect(containsSwear("Bună ziua, Oracolule!")).toBe(false);
  });

  it("returns false for a justice trigger phrase (not a swear)", () => {
    expect(containsSwear("fa dreptate oracolule")).toBe(false);
  });

  it("detects 'pula' (exact base form)", () => {
    expect(containsSwear("pula ta")).toBe(true);
  });

  it("detects 'muie'", () => {
    expect(containsSwear("muie oracle")).toBe(true);
  });

  it("detects 'pizda'", () => {
    expect(containsSwear("pizda mea")).toBe(true);
  });

  it("normalises diacritics — 'pulă' matches the 'pula' pattern", () => {
    expect(containsSwear("pulă")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(containsSwear("PULA")).toBe(true);
    expect(containsSwear("Muie")).toBe(true);
  });

  it("does not false-positive on partial-word matches (word boundary required)", () => {
    // "formula" contains "la" but not a swear word as a whole token
    expect(containsSwear("formula magica")).toBe(false);
  });
});

// ─── handleToxicity ───────────────────────────────────────────────────────────

describe("handleToxicity", () => {
  const BOT_ID = "oracle-bot-id";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false immediately when the bot is not ready (client.user is null)", async () => {
    const msg = makeMessage({ botId: BOT_ID, content: "pula", authorId: "u-notready" });
    const client = { user: null } as unknown as Client;
    const result = await handleToxicity(client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when bot is not mentioned", async () => {
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pula",
      authorId: "u-notmentioned",
      isMentioned: false,
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false for clean text even when the bot is mentioned", async () => {
    const msg = makeMessage({
      botId: BOT_ID,
      content: "buna ziua oracolule cum esti",
      authorId: "u-clean",
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns true and posts a reply when a swear word is detected", async () => {
    const msg = makeMessage({ botId: BOT_ID, content: "pula", authorId: "u-swear-basic" });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("issues Discord timeout when bot has ModerateMembers + member is manageable", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "muie",
      authorId: "u-muted-ok",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(mockTimeout).toHaveBeenCalledOnce();
  });

  it("does NOT include the 'no-power' note in the reply when timeout succeeded", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pula",
      authorId: "u-muted-clean-reply",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).not.toContain("nu deține puterea");
  });

  it("skips timeout when bot lacks ModerateMembers permission", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pizda",
      authorId: "u-noperm",
      hasPermission: false,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("includes the 'no-power' note when permission is missing", async () => {
    const msg = makeMessage({
      botId: BOT_ID,
      content: "pizda",
      authorId: "u-noperm-note",
      hasPermission: false,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("nu deține puterea");
  });

  it("skips timeout when member.manageable is false (role hierarchy blocks it)", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "futu-te",
      authorId: "u-unmanageable",
      hasPermission: true,
      memberManageable: false,
      timeoutFn: mockTimeout,
    });
    await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("nu deține puterea");
  });

  it("still replies even when the timeout call itself throws", async () => {
    const mockTimeout = vi.fn().mockRejectedValue(new Error("Missing Access"));
    const msg = makeMessage({
      botId: BOT_ID,
      content: "muie",
      authorId: "u-timeout-throws",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("strips @mention tokens before checking for swear words", async () => {
    // The raw content includes a mention prefix but the swear word is still there
    const msg = makeMessage({
      botId: BOT_ID,
      content: "<@oracle-bot-id> pula ta",
      authorId: "u-mention-swear",
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
  });
});
