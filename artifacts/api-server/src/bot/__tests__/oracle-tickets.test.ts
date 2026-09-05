import { describe, expect, it } from "vitest";
import type { Message } from "discord.js";
import {
  ORACLE_TICKET_CATEGORY_IDS,
  buildTicketSystemInstruction,
  getOracleTicketKind,
} from "../oracle-chat";
import {
  staffDetailsModal,
  ticketModal,
  ticketPanelPayload,
  ticketQuestionModal,
  ticketRequirementsEmbed,
} from "../ticket-ui";

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
    expect(instruction).toContain("⚠️ Tag-ul serverului este OBLIGATORIU pentru validarea aplicației.");
    expect(instruction).toContain("Fără tag → aplicația este respinsă automat.");
    expect(instruction).toContain("⚠️ Aplicările incomplete sau făcute în glumă vor fi respinse.");
    expect(instruction).toContain("Un membru al echipei te va prelua cât mai curând.");
    expect(instruction).toContain("Tagul rămâne o condiție obligatorie");
    expect(instruction).toContain("Vârsta este obligatorie");
    expect(instruction).toContain("Ce vârstă ai?");
    expect(instruction).toContain("Care este numele tău și fusul orar?");
    expect(instruction).not.toContain("Care este tagul serverului? (obligatoriu)");
    expect(instruction).not.toContain("Ce vârstă ai? (opțional)");
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

  it("builds a staff panel with a seven-question dropdown menu", () => {
    const panel = ticketPanelPayload("staff");
    const embed = panel.embeds[0]!.toJSON();
    const row = panel.components[0]!.toJSON();

    expect(embed.title).toBe("🛡️ Aplicare Staff");
    expect(embed.fields?.[0]?.value).toContain("Tag-ul serverului");
    const menu = row.components[0];
    expect(menu?.custom_id).toBe("ticket_questions_staff");
    expect(menu?.options).toHaveLength(7);
    expect(menu?.options?.map((option) => option.label)).toEqual([
      "1. Nume și fus orar",
      "2. Vârstă",
      "3. Experiență în moderare",
      "4. Timp disponibil",
      "5. De ce dorești rolul?",
      "6. Conflict între membri",
      "7. Îmbunătățiri pentru server",
    ]);
    const questionModal = ticketQuestionModal("staff", "conflict")?.toJSON();
    expect(questionModal?.custom_id).toBe("ticket_answer_staff_conflict");
    expect(questionModal?.components).toHaveLength(1);
    const questionModalRow = questionModal?.components[0];
    const questionInput =
      questionModalRow && "components" in questionModalRow
        ? questionModalRow.components[0]
        : undefined;
    expect(
      questionInput,
    ).toMatchObject({ custom_id: "answer" });
  });

  it("keeps the seal thumbnail on the interactive panel", () => {
    const panel = ticketPanelPayload("staff");
    const embed = panel.embeds[0]!.toJSON();
    expect(embed.thumbnail?.url).toContain("/api/assets/ticket_seal.png");
  });

  it("keeps the partnership question menu complete", () => {
    const panel = ticketPanelPayload("partnership");
    const menu = panel.components[0]!.toJSON().components[0];
    expect(menu?.custom_id).toBe("ticket_questions_partnership");
    expect(menu?.options).toHaveLength(7);
  });

  it("keeps the help and report question menu focused", () => {
    const panel = ticketPanelPayload("help_report");
    const menu = panel.components[0]!.toJSON().components[0];
    expect(menu?.custom_id).toBe("ticket_questions_help_report");
    expect(menu?.options).toHaveLength(5);
  });

  it("builds valid five-field modals and keeps the partnership description mandatory", () => {
    const staffModal = ticketModal("staff").toJSON();
    const partnershipModal = ticketModal("partnership").toJSON();

    expect(staffModal.components).toHaveLength(5);
    expect(partnershipModal.components).toHaveLength(5);
    const partnershipIds = partnershipModal.components.flatMap((row) =>
      "components" in row
        ? row.components.flatMap((component) =>
            "custom_id" in component ? [component.custom_id] : [],
          )
        : [],
    );
    expect(partnershipIds).toContain("partnership_description");
  });

  it("uses a second interactive step for the final staff questions", () => {
    const detailsModal = staffDetailsModal().toJSON();
    const detailIds = detailsModal.components.flatMap((row) =>
      "components" in row
        ? row.components.flatMap((component) =>
            "custom_id" in component ? [component.custom_id] : [],
          )
        : [],
    );

    expect(detailIds).toEqual(["staff_conflict", "staff_improvements"]);
  });

  it("shows the final seven staff questions in the interactive requirements view", () => {
    const requirements = ticketRequirementsEmbed("staff").toJSON().description;
    expect(requirements).toContain("1. Care este numele tău și fusul orar?");
    expect(requirements).toContain("2. Ce vârstă ai?");
    expect(requirements).toContain("7. Ce ai îmbunătăți pe server?");
    expect(requirements).not.toContain("Care este tagul serverului?");
  });
});