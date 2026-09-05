import { describe, expect, it } from "vitest";
import type { Message } from "discord.js";
import {
  ORACLE_TICKET_CATEGORY_IDS,
  buildTicketSystemInstruction,
  getOracleTicketKind,
} from "../oracle-chat";
import {
  staffDetailsModal,
  isStaffTagRefusal,
  ticketModal,
  ticketPanelPayload,
  ticketQuestionModal,
  ticketRequirementsEmbed,
  ticketStatusRow,
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
    expect(instruction).toContain("Care este numele tău?");
    expect(instruction).not.toContain("fusul orar");
    expect(instruction).toContain("Accepți să porți tag-ul serverului?");
    expect(instruction).toContain("aplicația este respinsă");
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

  it("starts the eight-question staff contract directly from question one", () => {
    const panel = ticketPanelPayload("staff");
    const embed = panel.embeds[0]!.toJSON();
    const row = panel.components[0]!.toJSON();

    expect(embed.title).toBe("🛡️ Aplicare Staff");
    expect(embed.fields?.[0]?.value).toContain("Tag-ul serverului");
    const startButton = row.components[0];
    const buttonData =
      startButton && "custom_id" in startButton ? startButton : undefined;
    expect(buttonData?.custom_id).toBe("ticket_start_staff");
    expect(buttonData && "label" in buttonData ? buttonData.label : undefined).toBe(
      "Deschide contractul",
    );

    const firstQuestion = ticketQuestionModal("staff", "name")?.toJSON();
    expect(firstQuestion?.custom_id).toBe("ticket_answer_staff_name");
    const finalQuestion = ticketQuestionModal("staff", "server_tag")?.toJSON();
    expect(finalQuestion?.custom_id).toBe("ticket_answer_staff_server_tag");

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

  it("replaces the public start button with a disabled final status", () => {
    const completed = ticketStatusRow("staff", "completed").toJSON().components[0];
    const rejected = ticketStatusRow("staff", "rejected").toJSON().components[0];
    expect(completed && "custom_id" in completed ? completed.custom_id : undefined).toBe(
      "ticket_status_staff_completed",
    );
    expect(completed && "label" in completed ? completed.label : undefined).toBe(
      "Contract completat",
    );
    expect(completed && "disabled" in completed ? completed.disabled : undefined).toBe(true);
    expect(rejected && "label" in rejected ? rejected.label : undefined).toBe(
      "Contract respins",
    );
  });

  it("starts partnership contracts directly from their first question", () => {
    const panel = ticketPanelPayload("partnership");
    const button = panel.components[0]!.toJSON().components[0];
    expect(button && "custom_id" in button ? button.custom_id : undefined).toBe(
      "ticket_start_partnership",
    );
    expect(ticketQuestionModal("partnership", "server_name")?.toJSON().custom_id).toBe(
      "ticket_answer_partnership_server_name",
    );
  });

  it("starts help and report contracts directly from their first question", () => {
    const panel = ticketPanelPayload("help_report");
    const button = panel.components[0]!.toJSON().components[0];
    expect(button && "custom_id" in button ? button.custom_id : undefined).toBe(
      "ticket_start_help_report",
    );
    expect(ticketQuestionModal("help_report", "type")?.toJSON().custom_id).toBe(
      "ticket_answer_help_report_type",
    );
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

    expect(detailIds).toEqual(["staff_conflict", "staff_improvements", "staff_tag"]);
  });

  it("shows the final eight staff questions without asking for a timezone", () => {
    const requirements = ticketRequirementsEmbed("staff").toJSON().description;
    expect(requirements).toContain("1. Care este numele tău?");
    expect(requirements).toContain("2. Ce vârstă ai?");
    expect(requirements).toContain("7. Ce ai îmbunătăți pe server?");
    expect(requirements).toContain("8. Accepți să porți tag-ul serverului?");
    expect(requirements).not.toContain("fusul orar");
  });

  it("rejects clear refusals of the mandatory server tag", () => {
    expect(isStaffTagRefusal("Nu")).toBe(true);
    expect(isStaffTagRefusal("nu vreau să îl port")).toBe(true);
    expect(isStaffTagRefusal("Refuz")).toBe(true);
    expect(isStaffTagRefusal("Da, îl voi purta")).toBe(false);
  });
});