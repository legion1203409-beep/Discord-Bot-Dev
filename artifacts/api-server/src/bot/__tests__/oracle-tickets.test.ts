import { describe, expect, it } from "vitest";
import type { Message } from "discord.js";
import {
  ORACLE_TICKET_CATEGORY_IDS,
  buildTicketSystemInstruction,
  getOracleTicketKind,
} from "../oracle-chat";

function messageWithParent(parentId: string | null): Pick<Message, "channel"> {
  return {
    channel: { parentId } as unknown as Message["channel"],
  };
}

describe("Oracle ticket categories", () => {
  it("recognizes the three configured open-ticket categories", () => {
    expect(getOracleTicketKind(messageWithParent(ORACLE_TICKET_CATEGORY_IDS.staff))).toBe("staff");
    expect(getOracleTicketKind(messageWithParent(ORACLE_TICKET_CATEGORY_IDS.partnership))).toBe("partnership");
    expect(getOracleTicketKind(messageWithParent(ORACLE_TICKET_CATEGORY_IDS.help_report))).toBe("help_report");
  });

  it("ignores channels outside the configured ticket categories", () => {
    expect(getOracleTicketKind(messageWithParent("999999999999999999"))).toBeNull();
    expect(getOracleTicketKind(messageWithParent(null))).toBeNull();
  });

  it("gives staff applications their own safe instructions", () => {
    const instruction = buildTicketSystemInstruction("staff");
    expect(instruction).toContain("aplicație de staff");
    expect(instruction).toContain("🛡️ Aplicare Staff");
    expect(instruction).toContain("⚠️ Aplicările incomplete sau făcute în glumă vor fi respinse.");
    expect(instruction).toContain("Un membru al echipei te va prelua cât mai curând.");
    expect(instruction).toContain("Care este tagul serverului? (obligatoriu)");
    expect(instruction).toContain("Vârsta este opțională");
    expect(instruction).toContain("Ce vârstă ai? (opțional)");
    expect(instruction).toContain("Care este numele tău și fusul orar?");
    expect(instruction).toContain("Cum ai rezolva un conflict între membri?");
    expect(instruction).toContain("Ce ai îmbunătăți pe server?");
    expect(instruction).toContain("Nu promite acceptarea");
    expect(instruction).toContain("Nu cere parole");
  });

  it("keeps partnerships and member reports distinct", () => {
    const partnership = buildTicketSystemInstruction("partnership");
    const helpReport = buildTicketSystemInstruction("help_report");

    expect(partnership).toContain("propunere de parteneriat");
    expect(partnership).toContain("🤝 Propunere de Parteneriat");
    expect(partnership).toContain("descrierea serverului");
    expect(partnership).toContain("tematică, tipul comunității și ce oferă");
    expect(partnership).toContain("numărul aproximativ de membri");
    expect(helpReport).toContain("raportarea unui membru");
    expect(helpReport).toContain("Păstrează raportarea confidențială");
  });
});