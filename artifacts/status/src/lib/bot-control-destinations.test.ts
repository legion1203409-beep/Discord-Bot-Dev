import { describe, expect, it } from "vitest";
import type { BotControlConfig } from "../hooks/use-moderation-api";
import { clearBotControlDestinations } from "./bot-control-destinations";

function makeConfig(): BotControlConfig {
  return {
    channels: {
      main: "main-channel",
      event: "event-channel",
      boss: "boss-channel",
      trader: "trader-channel",
      eventTop: "event-top-channel",
      bossTop: "boss-top-channel",
      council: "council-channel",
      fratia: "fratia-channel",
      legacy: "legacy-channel",
    },
    verification: { enabled: true, channelId: "verification-channel" },
    tickets: {
      categories: { staff: "staff-category", partnership: "partnership-category", help_report: "help-category", appeal: "appeal-category" },
      alliancePublicChannelId: "alliance-channel",
    },
    gameplayConfig: {
      memberMessages: {
        welcomeEnabled: true,
        leaveEnabled: true,
        channelId: "member-messages-channel",
      },
    },
    dailyStats: { channelId: "daily-stats-channel" },
    inviteTracking: {
      enabled: true,
      joinLogChannelId: "invite-log-channel",
      reportChannelId: "invite-report-channel",
      reportEnabled: true,
    },
  } as unknown as BotControlConfig;
}

describe("clearBotControlDestinations", () => {
  it("clears only gameplay destinations for the gameplay category", () => {
    const config = makeConfig();
    const cleared = clearBotControlDestinations(config, "gameplay");

    expect(cleared.channels).toMatchObject({
      main: "",
      event: "",
      boss: "",
      trader: "",
      eventTop: "",
      bossTop: "",
      council: "council-channel",
      fratia: "fratia-channel",
    });
    expect(cleared.tickets).toBe(config.tickets);
    expect(cleared.verification).toBe(config.verification);
  });

  it("clears admin channels, ticket categories, and the alliance destination together", () => {
    const cleared = clearBotControlDestinations(makeConfig(), "admin");

    expect(cleared.channels.council).toBe("");
    expect(cleared.channels.fratia).toBe("");
    expect(cleared.tickets.categories).toEqual({ staff: "", partnership: "", help_report: "", appeal: "" });
    expect(cleared.tickets.alliancePublicChannelId).toBe("");
  });

  it("disables invite tracking when clearing report destinations", () => {
    const cleared = clearBotControlDestinations(makeConfig(), "reports");

    expect(cleared.dailyStats.channelId).toBe("");
    expect(cleared.inviteTracking).toMatchObject({
      enabled: false,
      joinLogChannelId: "",
      reportChannelId: "",
      reportEnabled: false,
    });
  });

  it("disables welcome and leave messages when clearing their destination", () => {
    const cleared = clearBotControlDestinations(makeConfig(), "memberMessages");

    expect(cleared.gameplayConfig.memberMessages).toMatchObject({
      welcomeEnabled: false,
      leaveEnabled: false,
      channelId: "",
    });
  });

  it("disables verification when clearing its destination", () => {
    const cleared = clearBotControlDestinations(makeConfig(), "verification");

    expect(cleared.verification).toMatchObject({ enabled: false, channelId: "" });
  });

  it("clears every known and saved channel and destination for the all scope", () => {
    const cleared = clearBotControlDestinations(makeConfig(), "all");

    expect(Object.values(cleared.channels).every((channelId) => channelId === "")).toBe(true);
    expect(cleared.verification).toMatchObject({ enabled: false, channelId: "" });
    expect(cleared.tickets.categories).toEqual({ staff: "", partnership: "", help_report: "", appeal: "" });
    expect(cleared.tickets.alliancePublicChannelId).toBe("");
    expect(cleared.gameplayConfig.memberMessages).toMatchObject({
      welcomeEnabled: false,
      leaveEnabled: false,
      channelId: "",
    });
    expect(cleared.dailyStats.channelId).toBe("");
    expect(cleared.inviteTracking).toMatchObject({
      enabled: false,
      joinLogChannelId: "",
      reportChannelId: "",
      reportEnabled: false,
    });
  });
});