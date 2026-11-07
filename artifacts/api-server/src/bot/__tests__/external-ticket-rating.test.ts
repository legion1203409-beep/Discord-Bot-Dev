import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { findTicketOpener, lostAccess } from "../external-ticket-rating";
import { normalizeSupportTicketsConfig, ratingPlaces } from "../support-tickets";

const bits = (...values: bigint[]) => ({ has: (bit: bigint) => values.includes(bit) });
const member = (id: string, allow: bigint[], deny: bigint[] = []) => ({ id, type: 1, allow: bits(...allow), deny: bits(...deny) });
const role = (id: string) => ({ id, type: 0, allow: bits(PermissionFlagsBits.ViewChannel), deny: bits() });

describe("stars for the other bot's tickets", () => {
  it("finds who the ticket was opened for: the member with their own access, not the bots or the staff", () => {
    const overwrites = [role("1"), member("bot", [PermissionFlagsBits.ViewChannel]), member("staff", [PermissionFlagsBits.ViewChannel]), member("ana", [PermissionFlagsBits.ViewChannel])];
    expect(findTicketOpener(overwrites, (id) => id === "bot" || id === "staff")).toBe("ana");
    expect(findTicketOpener([role("1"), member("ion", [], [PermissionFlagsBits.ViewChannel])], () => false)).toBeNull();
  });

  it("knows the ticket was closed when its member lost access", () => {
    const open = { permissionOverwrites: { cache: new Map([["ana", member("ana", [PermissionFlagsBits.ViewChannel])]]) } };
    const removed = { permissionOverwrites: { cache: new Map() } };
    const denied = { permissionOverwrites: { cache: new Map([["ana", member("ana", [], [PermissionFlagsBits.ViewChannel])]]) } };
    expect(lostAccess(open, "ana")).toBe(false);
    expect(lostAccess(removed, "ana")).toBe(true);
    expect(lostAccess(denied, "ana")).toBe(true);
  });

  it("asks where the server chose, and every old category is on by default", () => {
    expect(ratingPlaces("auto")).toEqual(["dm", "ticket"]);
    expect(ratingPlaces("dm")).toEqual(["dm"]);
    expect(ratingPlaces("ticket")).toEqual(["ticket", "dm"]);
    const config = normalizeSupportTicketsConfig({});
    expect(config.rating.where).toBe("auto");
    expect(config.rating.external).toEqual({ staff: true, partnership: true, help_report: true, appeal: true });
    const changed = normalizeSupportTicketsConfig({ rating: { where: "ticket", external: { partnership: false } } });
    expect(changed.rating.where).toBe("ticket");
    expect(changed.rating.external.partnership).toBe(false);
    expect(changed.rating.external.appeal).toBe(true);
  });
});
