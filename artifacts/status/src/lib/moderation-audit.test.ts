import { describe, expect, it } from "vitest";
import {
  filterAuditEvents,
  getAuditEventCategory,
  presentAuditActor,
  presentAuditLog,
  type ModerationAuditLog,
} from "./moderation-audit";

function log(eventType: string, detail: Record<string, unknown>, targetType = "member"): ModerationAuditLog {
  return {
    id: "audit-id",
    guildId: "123456789012345678",
    actorId: null,
    eventType,
    targetType,
    targetId: "234567890123456789",
    detail,
    createdAt: "2026-09-24T12:00:00.000Z",
  };
}

describe("moderation audit event presentation", () => {
  it("shows unverified actors and human-readable message metadata without content", () => {
    const event = log("discord.message_update", {
      actorVerified: false,
      channelId: "345678901234567890",
      contentChanged: true,
      messageContent: "must not appear",
    }, "message");
    const presentation = presentAuditLog(event);

    expect(presentAuditActor(event)).toBe("Actor neverificat");
    expect(presentation.title).toBe("Mesaj editat");
    expect(presentation.details).toContain("345678901234567890");
    expect(presentation.details).toContain("Conținutul nu este salvat");
    expect(presentation.details).not.toContain("must not appear");
  });

  it("renders member and resource changes from actual audit fields", () => {
    const memberEvent = log("discord.member_update", {
      actorVerified: true,
      nicknameChanged: true,
      oldNickname: "Umbra",
      newNickname: "Stea",
      addedRoles: ["345678901234567890"],
      removedRoles: [],
    });
    const roleEvent = log("discord.guildRoleUpdate", {
      actorVerified: false,
      entityName: "Moderator",
      changes: { name: { from: "Membru", to: "Moderator" } },
    }, "role");

    expect(presentAuditActor(memberEvent)).toBe("Sistem");
    expect(presentAuditLog(memberEvent).details).toContain("Umbra");
    expect(presentAuditLog(memberEvent).details).toContain("345678901234567890");
    expect(presentAuditActor(roleEvent)).toBe("Actor neverificat");
    expect(presentAuditLog(roleEvent).title).toBe("Rol actualizat");
    expect(presentAuditLog(roleEvent).details).toContain("Moderator");
    expect(presentAuditLog(roleEvent).details).toContain("Membru");
  });
});

describe("moderation audit event categories", () => {
  it.each([
    ["discord.message_update", "messages"],
    ["discord.member_join", "members"],
    ["discord.channelCreate", "channels"],
    ["discord.guildRoleUpdate", "roles"],
    ["discord.voice_state_update", "voice"],
    ["case.created", "moderation"],
    ["action.applied", "moderation"],
    ["raid.detected", "security"],
    ["automod.message_delete_failed", "security"],
    ["future.event", "other"],
  ] as const)("categorizes %s as %s", (eventType, category) => {
    expect(getAuditEventCategory(eventType)).toBe(category);
  });

  it("combines category and text search filters", () => {
    const events = [
      log("discord.member_join", { summary: "Umbra entered" }),
      log("discord.message_delete", { summary: "Umbra message removed" }),
      log("discord.member_leave", { summary: "Different member left" }),
    ];

    expect(filterAuditEvents(events, "intrat pe server", "members").map((event) => event.eventType))
      .toEqual(["discord.member_join"]);
    expect(filterAuditEvents(events, "", "members").map((event) => event.eventType))
      .toEqual(["discord.member_join", "discord.member_leave"]);
    expect(filterAuditEvents(events, "intrat pe server", "all").map((event) => event.eventType))
      .toEqual(["discord.member_join"]);
  });
});