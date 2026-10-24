import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "discord.js";

const mocks = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  hasProcessed: vi.fn(),
  markProcessed: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = { completions: { create: mocks.createCompletion } };
  },
}));

vi.mock("./db", () => ({
  hasProcessedMessageTranslation: mocks.hasProcessed,
  loadMessageTranslationConfig: mocks.loadConfig,
  markMessageTranslationProcessed: mocks.markProcessed,
  saveMessageTranslationConfig: mocks.saveConfig,
}));

import {
  getMessageTranslationChannel,
  maybeTranslateMessage,
  setMessageTranslationChannel,
} from "./message-translation";

function makeMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    id: "message-1",
    guildId: "guild-translation-test",
    channelId: "channel-translation-test",
    content: "Hello, welcome!",
    author: { bot: false },
    webhookId: null,
    reply: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Message;
}

describe("automatic message translation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.hasProcessed.mockResolvedValue(false);
    mocks.markProcessed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("translates eligible messages and replies without allowing mentions", async () => {
    mocks.loadConfig.mockResolvedValue({ channelId: "channel-translation-test" });
    mocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: "Bun venit!" } }],
    });
    const message = makeMessage({
      id: "translated-successfully",
      guildId: "guild-translation-success",
    });

    await maybeTranslateMessage(message, true);

    expect(mocks.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "Hello, welcome!" }),
        ]),
      }),
      expect.objectContaining({ maxRetries: 1 }),
    );
    expect(message.reply).toHaveBeenCalledWith({
      content: "🇷🇴 **Traducere:**\nBun venit!",
      allowedMentions: { parse: [], repliedUser: false },
    });
    expect(mocks.markProcessed).toHaveBeenCalledWith(
      "guild-translation-success",
      "translated-successfully",
    );
  });

  it("does not call OpenAI for messages outside the configured channel", async () => {
    mocks.loadConfig.mockResolvedValue({ channelId: "another-channel" });
    const message = makeMessage({
      id: "message-in-another-channel",
      guildId: "guild-outside-configured-channel",
    });

    await maybeTranslateMessage(message, true);

    expect(mocks.createCompletion).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("does not translate when the privileged message-content intent is unavailable", async () => {
    mocks.loadConfig.mockResolvedValue({ channelId: "channel-translation-test" });
    const message = makeMessage({
      id: "message-without-intent",
      guildId: "guild-without-intent",
    });

    await maybeTranslateMessage(message, false);

    expect(mocks.createCompletion).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("does not post a duplicate when the message is already Romanian", async () => {
    mocks.loadConfig.mockResolvedValue({ channelId: "channel-translation-test" });
    mocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: "<<NO_TRANSLATION_REQUIRED>>" } }],
    });
    const message = makeMessage({
      id: "already-romanian",
      guildId: "guild-already-romanian",
    });

    await maybeTranslateMessage(message, true);

    expect(message.reply).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith("guild-already-romanian", "already-romanian");
  });

  it("skips a message already recorded as translated before a bot restart", async () => {
    mocks.loadConfig.mockResolvedValue({ channelId: "channel-translation-test" });
    mocks.hasProcessed.mockResolvedValue(true);
    const message = makeMessage({
      id: "persistently-processed-message",
      guildId: "guild-persistently-processed",
    });

    await maybeTranslateMessage(message, true);

    expect(mocks.createCompletion).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("persists and caches the configured channel", async () => {
    await setMessageTranslationChannel("guild-config-test", "channel-config-test");

    expect(mocks.saveConfig).toHaveBeenCalledWith("guild-config-test", {
      channelId: "channel-config-test",
    });
    expect(await getMessageTranslationChannel("guild-config-test")).toBe("channel-config-test");
  });
});
