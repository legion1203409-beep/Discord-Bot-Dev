import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock discord.js — only PermissionFlagsBits is used at runtime ─────────────
vi.mock("discord.js", () => ({
  PermissionFlagsBits: { ModerateMembers: 268435456n },
}));

// ── Mock logger so test output stays clean ────────────────────────────────────
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock status-effects so tests control clearCurses return value ─────────────
vi.mock("../status-effects", () => ({
  clearCurses: vi.fn().mockReturnValue(0),
  grantRandomCurse: vi.fn().mockReturnValue({ id: "curse-test", label: "Blestem Test", emoji: "🌑" }),
}));

// Import after mocks are registered
import { containsSwear, handleToxicity, handlePardon, isPardonRequest, envInt } from "../oracle-guard";
import { clearCurses } from "../status-effects";
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

  it("catches vocative / inflected insult forms (how insults are actually used)", () => {
    expect(containsSwear("esti prost")).toBe(true);
    expect(containsSwear("prostule")).toBe(true);
    expect(containsSwear("idiotule")).toBe(true);
    expect(containsSwear("imbecilule")).toBe(true);
    expect(containsSwear("cretinule ce esti")).toBe(true);
    expect(containsSwear("boule")).toBe(true);
    expect(containsSwear("magarule")).toBe(true);
  });

  it("catches feminine insult forms via dedicated stems", () => {
    expect(containsSwear("esti proasta")).toBe(true);
    expect(containsSwear("proasto")).toBe(true);
    expect(containsSwear("idioata")).toBe(true);
    expect(containsSwear("idioată")).toBe(true);
    expect(containsSwear("dobitoaca")).toBe(true);
  });

  it("catches 'bou' inflections via stem (boul/boului/boilor)", () => {
    expect(containsSwear("esti un bou")).toBe(true);
    expect(containsSwear("boul")).toBe(true);
    expect(containsSwear("boului")).toBe(true);
    expect(containsSwear("boilor")).toBe(true);
  });

  it("catches profanity inflections via stem match", () => {
    expect(containsSwear("futu-te")).toBe(true);
    expect(containsSwear("te fut")).toBe(true);
    expect(containsSwear("muist")).toBe(true);
  });

  it("does not false-positive on innocent words that start like a short insult", () => {
    expect(containsSwear("merg in vacanta")).toBe(false);
    expect(containsSwear("ce curaj ai")).toBe(false);
    expect(containsSwear("imi place puloverul")).toBe(false);
    expect(containsSwear("porti un boiler")).toBe(false);
    expect(containsSwear("vasul e din portelan")).toBe(false);
  });

  it("does not mute innocent RPG/game talk (no overly broad animal triggers)", () => {
    expect(containsSwear("ce animal de companie sa aleg?")).toBe(false);
    expect(containsSwear("un curent de aer rece")).toBe(false);
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

  it("mutes + warns on a plain insult (no hard profanity), e.g. 'prostule'", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makeMessage({
      botId: BOT_ID,
      content: "esti prostule",
      authorId: "u-insult-prostule",
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    const result = await handleToxicity(makeClient(BOT_ID), msg as unknown as Message);
    expect(result).toBe(true);
    expect(mockTimeout).toHaveBeenCalledOnce();
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

// ─── envInt ────────────────────────────────────────────────────────────────────

describe("envInt", () => {
  const VAR = "TEST_ORACLE_ENVINT";

  afterEach(() => {
    delete process.env[VAR];
  });

  it("returns the fallback when the env var is not set", () => {
    delete process.env[VAR];
    expect(envInt(VAR, 30)).toBe(30);
  });

  it("returns the fallback when the env var is an empty string", () => {
    process.env[VAR] = "";
    expect(envInt(VAR, 30)).toBe(30);
  });

  it("returns the fallback and warns when the env var is a non-numeric string", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "banana";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "banana", fallback: 30 }),
      expect.any(String),
    );
  });

  it("returns the fallback and warns when the env var is zero", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "0";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "0", fallback: 30 }),
      expect.any(String),
    );
  });

  it("returns the fallback and warns when the env var is a negative number", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "-5";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "-5", fallback: 30 }),
      expect.any(String),
    );
  });

  it("returns the fallback and warns when the env var is a float", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "3.14";
    const result = envInt(VAR, 30);
    expect(result).toBe(30);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "3.14", fallback: 30 }),
      expect.any(String),
    );
  });

  it("clamps to max and warns when the value exceeds the allowed maximum", async () => {
    const { logger } = await import("../../lib/logger");
    process.env[VAR] = "9999";
    const result = envInt(VAR, 30, 1440);
    expect(result).toBe(1440);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: VAR, value: "9999", max: 1440 }),
      expect.any(String),
    );
  });

  it("returns the value as-is when it is valid and within the max", () => {
    process.env[VAR] = "60";
    expect(envInt(VAR, 30, 1440)).toBe(60);
  });

  it("returns the value when it exactly equals the max", () => {
    process.env[VAR] = "1440";
    expect(envInt(VAR, 30, 1440)).toBe(1440);
  });

  it("returns the value as-is when no max is provided, even for a large number", () => {
    process.env[VAR] = "9999";
    expect(envInt(VAR, 30)).toBe(9999);
  });
});

// ─── isPardonRequest ───────────────────────────────────────────────────────────

describe("isPardonRequest", () => {
  it("returns true for 'iarta'", () => {
    expect(isPardonRequest("iarta")).toBe(true);
  });

  it("returns true for 'iarta-l' (with suffix)", () => {
    expect(isPardonRequest("iarta-l")).toBe(true);
  });

  it("returns true for 'reseteaza blestemul'", () => {
    expect(isPardonRequest("reseteaza blestemul")).toBe(true);
  });

  it("returns true for 'pardoneaza-l'", () => {
    expect(isPardonRequest("pardoneaza-l")).toBe(true);
  });

  it("returns false for plain justice text", () => {
    expect(isPardonRequest("fa dreptate")).toBe(false);
  });

  it("returns false for clean unrelated text", () => {
    expect(isPardonRequest("buna ziua oracolule")).toBe(false);
  });
});

// ─── handlePardon ─────────────────────────────────────────────────────────────

/**
 * Build a minimal fake Message for handlePardon tests.
 * `targetIds` are the users that appear in message.mentions.users.
 */
function makePardonMessage(opts: {
  authorId: string;
  content: string;
  guildOwnerId?: string;
  targetIds?: string[];
  targetBot?: boolean;
  hasPermission?: boolean;
  memberManageable?: boolean;
  timeoutFn?: ReturnType<typeof vi.fn>;
}) {
  const {
    authorId,
    content,
    guildOwnerId = "guild-owner-id",
    targetIds = [],
    targetBot = false,
    hasPermission = true,
    memberManageable = true,
  } = opts;

  const mockTimeout = opts.timeoutFn ?? vi.fn().mockResolvedValue(undefined);

  // Build the members map for mentions.users
  const mentionedUsers = new Map(
    targetIds.map((id) => [
      id,
      { id, bot: targetBot, username: `user-${id}` },
    ]),
  );

  const targetMember = {
    displayName: `DisplayName-${targetIds[0] ?? "?"}`,
    manageable: memberManageable,
    timeout: mockTimeout,
  };

  const botMember = {
    permissions: { has: vi.fn().mockReturnValue(hasPermission) },
  };

  const mockReply = vi.fn().mockResolvedValue(undefined);

  const msg = {
    content,
    author: { id: authorId, bot: false },
    guild: {
      ownerId: guildOwnerId,
      members: {
        me: botMember,
        fetch: vi.fn().mockResolvedValue(targetMember),
      },
    },
    mentions: {
      users: {
        filter: (pred: (u: { id: string; bot: boolean }) => boolean) => {
          const filtered = new Map<string, { id: string; bot: boolean; username: string }>();
          for (const [id, u] of mentionedUsers) {
            if (pred(u as { id: string; bot: boolean })) filtered.set(id, u);
          }
          return filtered;
        },
        size: mentionedUsers.size,
      },
    },
    reply: mockReply,
    _reply: mockReply,
    _timeout: mockTimeout,
    _botMember: botMember,
  };

  return msg;
}

describe("handlePardon", () => {
  const OWNER_ID = "pardon-owner-id";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORACLE_OWNER_ID = OWNER_ID;
  });

  afterEach(() => {
    delete process.env.ORACLE_OWNER_ID;
  });

  it("returns false when the author is not the owner", async () => {
    const msg = makePardonMessage({
      authorId: "random-user-999",
      content: "iarta-l pe acest om",
      targetIds: ["target-u1"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when the content is not a pardon request", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "fa dreptate oracolule",
      targetIds: ["target-u2"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when there are no non-bot, non-owner targets mentioned", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta",
      targetIds: [],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns false when only the bot itself is mentioned", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta",
      targetIds: ["bot-id-xyz"],
      targetBot: true,
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(false);
    expect(msg._reply).not.toHaveBeenCalled();
  });

  it("returns true and replies with the absolution message for a valid pardon", async () => {
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta-l",
      targetIds: ["target-u3"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("Cartea Iertării");
  });

  it("clears game curses for the pardoned user", async () => {
    const clearCursesMock = vi.mocked(clearCurses);
    clearCursesMock.mockReturnValue(2); // had 2 active curses

    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "reseteaza blestemul",
      targetIds: ["target-u4"],
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(clearCursesMock).toHaveBeenCalledWith("target-u4");
  });

  it("mentions lifted curses in the reply when the user had active curses", async () => {
    vi.mocked(clearCurses).mockReturnValue(1); // had curses

    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "ierta",
      targetIds: ["target-u5"],
    });
    await handlePardon({} as Client, msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("blestemurile ridicate");
  });

  it("calls member.timeout(null) to lift an active Discord timeout", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta-l",
      targetIds: ["target-u6"],
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(mockTimeout).toHaveBeenCalledWith(null, expect.any(String));
  });

  it("does NOT call member.timeout(null) when bot lacks ModerateMembers permission", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "pardoneaza-l",
      targetIds: ["target-u7"],
      hasPermission: false,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("does NOT call member.timeout(null) when member is not manageable", async () => {
    const mockTimeout = vi.fn().mockResolvedValue(undefined);
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "iarta",
      targetIds: ["target-u8"],
      hasPermission: true,
      memberManageable: false,
      timeoutFn: mockTimeout,
    });
    await handlePardon({} as Client, msg as unknown as Message);
    expect(mockTimeout).not.toHaveBeenCalled();
  });

  it("still returns true and replies even if member.timeout(null) throws", async () => {
    const mockTimeout = vi.fn().mockRejectedValue(new Error("Missing Access"));
    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "ierta",
      targetIds: ["target-u9"],
      hasPermission: true,
      memberManageable: true,
      timeoutFn: mockTimeout,
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(true);
    expect(msg._reply).toHaveBeenCalledOnce();
  });

  it("shows 'already clean' message when the user had no offenses and no curses", async () => {
    vi.mocked(clearCurses).mockReturnValue(0); // no curses
    // No prior offense recorded for this unique user id

    const msg = makePardonMessage({
      authorId: OWNER_ID,
      content: "ierta",
      targetIds: ["target-u-clean-slate"],
    });
    await handlePardon({} as Client, msg as unknown as Message);
    const replyContent: string = (msg._reply.mock.calls[0] as [{ content: string }])[0].content;
    expect(replyContent).toContain("sufletul acestui muritor era deja curat");
  });

  it("accepts the guild owner as the pardoning authority when ORACLE_OWNER_ID is not set", async () => {
    delete process.env.ORACLE_OWNER_ID;

    const msg = makePardonMessage({
      authorId: "guild-owner-id",
      content: "iarta-l",
      guildOwnerId: "guild-owner-id",
      targetIds: ["target-u10"],
    });
    const result = await handlePardon({} as Client, msg as unknown as Message);
    expect(result).toBe(true);
  });
});
