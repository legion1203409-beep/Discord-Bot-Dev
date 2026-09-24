import { describe, expect, it } from "vitest";
import { presentAuditActor, presentAuditLog, type ModerationAuditLog } from "./moderation-audit";

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