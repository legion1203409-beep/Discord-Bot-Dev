import { describe, expect, it, vi } from "vitest";
import type { Message } from "discord.js";
import { isTicketCategoryParentId } from "../ticket-categories";
import {
  ORACLE_TICKET_CATEGORY_IDS,
  buildTicketSystemInstruction,
  getOracleTicketKind,
} from "../oracle-chat";
import {
  staffDetailsModal,
  partnershipDetailsModal,
  partnershipEditModal,
  partnershipHasUnder200Members,
  allianceAnnouncementText,
  allianceRecruitmentEmbed,
  isLegacyOracleTicketPromptText,
  isStaffTagRefusal,
  partnershipConfirmRow,
  partnershipPublishRow,
  partnershipDraftEmbed,
  partnershipSummaryEmbed,
  STAFF_REVIEW_ROLE_ID,
  memberHasStaffReviewRole,
  allianceRecruitmentAnnouncementText,
  allianceRecruitmentTextModal,
  allianceStaffNotificationText,
  INCOMPLETE_TICKET_TIMEOUT_MS,
  INCOMPLETE_TICKET_FIRST_WARNING_AFTER_MS,
  INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS,
  INCOMPLETE_TICKET_WARNING_AFTER_MS,
  scheduleIncompleteTicketDeletion,
  staffOracleReviewPayload,
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

  it("marks ticket category parents as protected from automated posts", () => {
    expect(isTicketCategoryParentId(ORACLE_TICKET_CATEGORY_IDS.staff)).toBe(true);
    expect(isTicketCategoryParentId(ORACLE_TICKET_CATEGORY_IDS.partnership)).toBe(true);
    expect(isTicketCategoryParentId(ORACLE_TICKET_CATEGORY_IDS.help_report)).toBe(true);
    expect(isTicketCategoryParentId("999999999999999999")).toBe(false);
    expect(isTicketCategoryParentId(null)).toBe(false);
  });

  it("gives staff applications their own safe instructions", () => {
    const instruction = buildTicketSystemInstruction("staff");
    expect(instruction).toContain("aplicație de staff");
    expect(instruction).toContain("Panoul și ferestrele interactive colectează toate răspunsurile");
    expect(instruction).not.toContain("La începutul aplicației, prezintă un mini-formular");
    expect(instruction).not.toContain("Folosește exact această ordine");
    expect(instruction).not.toContain("Care este numele tău?");
    expect(instruction).toContain("Tagul rămâne o condiție obligatorie");
    expect(instruction).toContain("aplicația este respinsă");
    expect(instruction).toContain("Nu promite acceptarea");
    expect(instruction).toContain("Nu cere parole");
  });

  it("keeps partnerships and member reports distinct", () => {
    const partnership = buildTicketSystemInstruction("partnership");
    const helpReport = buildTicketSystemInstruction("help_report");

    expect(partnership).toContain("propunere de parteneriat");
    expect(partnership).not.toContain("Cere obligatoriu, în această ordine");
    expect(partnership).toContain("nu enumera câmpurile formularului");
    expect(helpReport).toContain("raportarea unui membru");
    expect(helpReport).toContain("Păstrează raportarea confidențială");
    expect(partnership).not.toContain("🤝 Propunere de Parteneriat");
  });

  it("detects titled and untitled legacy Oracle forms", () => {
    expect(isLegacyOracleTicketPromptText([
      "🤝 Propunere de Parteneriat",
      "1) Numele serverului",
      "2) Reprezentantul",
      "3) Linkul",
      "4) Membrii",
      "5) Descrierea",
    ].join("\n"))).toBe(true);
    expect(isLegacyOracleTicketPromptText([
      "Pentru a începe, adu-mi în această ordine:",
      "1) numele serverului",
      "2) reprezentantul serverului",
      "3) linkul serverului",
      "4) numărul de membri",
      "5) descrierea",
      "6) motivul alianței",
      "7) ce oferă serverul",
      "8) acceptarea regulilor",
    ].join("\n"))).toBe(true);
    expect(isLegacyOracleTicketPromptText("Pot să îți explic pe scurt cum funcționează verificarea.")).toBe(false);
  });

  it("starts the eight-question staff contract directly from question one", () => {
    const panel = ticketPanelPayload("staff");
    const embed = panel.embeds[0]!.toJSON();
    const row = panel.components[0]!.toJSON();

    expect(embed.title).toBe("🛡️ Aplicare Staff");
    expect(embed.fields?.[0]?.value).toContain("Tag-ul serverului");
    expect(embed.fields?.find(
      (field) => field.name === "📋 Întrebările contractului",
    )).toBeUndefined();
    const contractField = embed.fields?.find((field) => field.name === "📜 Contractul");
    expect(contractField?.value).toContain("două pagini de formular");
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
    expect(ticketQuestionModal("partnership", "description")?.toJSON().components[0]).toBeDefined();
  });

  it("creates a confirmable partnership draft with publish and edit buttons", () => {
    const summary = partnershipSummaryEmbed("Andrei", {
      server_name: "Regatul Umbrelor",
      description: "Comunitate RPG medievală.",
      invite: "https://discord.gg/umbrelor",
    }).toJSON();
    expect(summary.title).toBe("🤝 Pactul celor Două Regate · Rezumat");
    expect(summary.fields?.map((field) => field.name)).toEqual([
      "🏰 Numele serverului",
      "📝 Descrierea serverului",
      "🔗 Linkul serverului",
      "👤 Reprezentantul serverului",
      "👥 Membri și activitate",
      "🕯️ Motivul alianței",
      "🎁 Ce oferă serverul",
      "📜 Așteptări și reguli",
    ]);
    const confirmButton = partnershipConfirmRow("123").toJSON().components[0];
    expect(confirmButton && "custom_id" in confirmButton ? confirmButton.custom_id : undefined).toBe(
      "ticket_alliance_confirm_123",
    );
    const draft = partnershipDraftEmbed("Andrei", {
      server_name: "Regatul Umbrelor",
      representative: "Andrei#1234",
      description: "Comunitate RPG medievală.",
      invite: "https://discord.gg/umbrelor",
      members: "150 total · 60 activi",
      motivation: "Vrem o comunitate aliată.",
      offer: "Promovare reciprocă.",
      terms: "Respectăm regulile pactului.",
    }).toJSON();
    expect(draft.title).toBe("🤝 Pactul celor Două Regate · Draft");
    expect(draft.fields?.map((field) => field.name)).toEqual([
      "🏰 Numele serverului",
      "📝 Descrierea serverului",
      "🔗 Linkul serverului",
      "👤 Reprezentantul serverului",
      "👥 Membri și activitate",
      "🕯️ Motivul alianței",
      "🎁 Ce oferă serverul",
      "📜 Așteptări și reguli",
      "👤 Persoana care a deschis ticketul",
      "📌 Regula promovării",
    ]);
    expect(draft.fields?.some((field) => field.value?.includes("Regatul Cenușii își deschide porțile"))).toBe(false);
    expect(draft.fields?.[0]?.value).toContain("Regatul Umbrelor");
    expect(draft.fields?.[2]?.value).toContain("https://discord.gg/umbrelor");
    expect(draft.fields?.[5]?.value).toContain("Vrem o comunitate aliată.");
    expect(draft.fields?.[8]?.value).toContain("Andrei");
    const publishButtons = partnershipPublishRow("123").toJSON().components;
    expect(publishButtons.map((button) => "custom_id" in button ? button.custom_id : undefined)).toEqual([
      "ticket_alliance_post_123",
      "ticket_alliance_edit_123",
    ]);
  });

  it("limits alliance actions to members with the alliance staff role", () => {
    expect(memberHasStaffReviewRole({ roles: [STAFF_REVIEW_ROLE_ID] })).toBe(true);
    expect(memberHasStaffReviewRole({ roles: ["another-role"] })).toBe(false);
    expect(memberHasStaffReviewRole({ roles: { cache: new Map() } })).toBe(false);
    expect(
      memberHasStaffReviewRole({
        roles: { cache: new Map([[STAFF_REVIEW_ROLE_ID, true]]) },
      }),
    ).toBe(true);
    expect(memberHasStaffReviewRole(null)).toBe(false);
  });

  it("marks only partnerships below 200 total members as no-ping promotions", () => {
    expect(partnershipHasUnder200Members("199 total · 80 activi")).toBe(true);
    expect(partnershipHasUnder200Members("200 total · 80 activi")).toBe(false);
    expect(partnershipHasUnder200Members("2.000 total · 300 activi")).toBe(false);
    expect(partnershipHasUnder200Members("nu este precizat")).toBe(false);
  });

  it("shows who completed the alliance contract in the public announcement", () => {
    const announcement = allianceAnnouncementText(
      {
        server_name: "Regatul Umbrelor",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
        members: "150 total · 60 activi",
        regat_description: "🌫️ Textul privat al Regatului Cenușii",
      },
      "Andrei",
    );

    expect(announcement).toContain("🤝 PACTUL CELOR DOUĂ REGATE");
    expect(announcement).toContain("🏰 Comunitatea parteneră: Regatul Umbrelor");
    expect(announcement).toContain("👤 Contract completat de: Andrei");
    expect(announcement).toContain("📌 Promovare: serverele sub 200 de membri");
    expect(announcement).not.toContain("Textul privat al Regatului Cenușii");
    expect(announcement).not.toContain("@everyone");
  });

  it("builds a designed automatic recruitment advertisement from the partner answers", () => {
    const ad = allianceRecruitmentEmbed(
      {
        server_name: "Regatul Umbrelor",
        representative: "Andrei#1234",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
        members: "150 total · 60 activi",
        motivation: "Vrem o comunitate aliată.",
        offer: "Promovare reciprocă.",
        terms: "Respectăm regulile pactului.",
      },
      "Andrei",
    ).toJSON();

    expect(ad.title).toContain("Regatul Umbrelor");
    expect(ad.description).toContain("Comunitate RPG medievală.");
    expect(ad.fields?.map((field) => field.name)).toEqual([
      "👤 Reprezentantul serverului",
      "🧑‍💻 Propus de",
      "👥 Membri și activitate",
      "🔗 Link de invitație",
      "🕯️ De ce caută alianța",
      "🎁 Ce oferă comunitatea",
      "📜 Așteptări și reguli",
    ]);
    expect(ad.fields?.find((field) => field.name === "🔗 Link de invitație")?.value).toContain(
      "https://discord.gg/umbrelor",
    );
  });

  it("builds the staff notification and approved recruitment announcement", () => {
    const staffNotification = allianceStaffNotificationText("Andrei");
    const recruitmentAnnouncement = allianceRecruitmentAnnouncementText();

    expect(staffNotification).toContain(`<@&${STAFF_REVIEW_ROLE_ID}>`);
    expect(staffNotification).toContain("O nouă cerere de alianță");
    expect(recruitmentAnnouncement).toContain("🌫️ Regatul Cenușii își deschide porțile");
    expect(recruitmentAnnouncement).toContain("Tag: || @here || || @everyone ||");
    expect(recruitmentAnnouncement).toContain(
      "https://discord.gg/regatulcenusii",
    );
    expect(recruitmentAnnouncement).toContain("standard.gif");
  });

  it("supports an administrator-owned custom alliance announcement", () => {
    const customText = "🌫️ Mesaj personalizat pentru alianță\n🔗 https://discord.gg/exemplu";
    const modal = allianceRecruitmentTextModal(customText).toJSON();
    const firstRow = modal.components?.[0];
    const input = firstRow && "components" in firstRow ? firstRow.components[0] : undefined;

    expect(modal.custom_id).toBe("alliance_recruitment_text_modal");
    expect(modal.title).toBe("Editează textul alianței");
    expect(input).toMatchObject({
      custom_id: "alliance_recruitment_text",
      value: customText,
    });
    expect(allianceRecruitmentAnnouncementText(customText)).toBe(customText);
    expect(allianceRecruitmentAnnouncementText("")).toContain(
      "🌫️ Regatul Cenușii își deschide porțile",
    );
  });

  it("warns after 20 and 50 minutes and deletes an unfinished ticket after 60 minutes", async () => {
    vi.useFakeTimers();
    try {
      const deleteChannel = vi.fn().mockResolvedValue(undefined);
      const fetchMessages = vi.fn().mockResolvedValue(new Map());
      const send = vi.fn().mockResolvedValue(undefined);
      scheduleIncompleteTicketDeletion({
        id: "unfinished-ticket",
        createdTimestamp: Date.now(),
        delete: deleteChannel,
        send,
        permissionOverwrites: {
          cache: [{
            id: "applicant-123",
            type: 1,
            allow: { has: vi.fn().mockReturnValue(true) },
          }],
        },
        messages: { fetch: fetchMessages },
      });

      await vi.advanceTimersByTimeAsync(INCOMPLETE_TICKET_WARNING_AFTER_MS);

      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining("<@applicant-123>"),
        allowedMentions: { parse: [], users: ["applicant-123"] },
      }));
      expect(send).toHaveBeenCalledTimes(1);
      expect(deleteChannel).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(
        INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS - INCOMPLETE_TICKET_FIRST_WARNING_AFTER_MS,
      );

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]?.content).toContain("<@applicant-123>");
      expect(send.mock.calls[1]?.[0]?.content).toContain("Au trecut 50 de minute");
      expect(send.mock.calls[1]?.[0]?.allowedMentions).toEqual({
        parse: [],
        users: ["applicant-123"],
      });

      await vi.advanceTimersByTimeAsync(
        INCOMPLETE_TICKET_TIMEOUT_MS - INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS,
      );
      expect(fetchMessages).toHaveBeenCalledWith({ limit: 100 });
      expect(deleteChannel).toHaveBeenCalledWith("Ticket incomplet după 60 de minute");
    } finally {
      vi.useRealTimers();
    }
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

  it("shows a live Discord countdown for ticket completion", () => {
    const deadline = 1_800_000_000_000;
    const panel = ticketPanelPayload("help_report", deadline);
    const embed = panel.embeds[0]!.toJSON();
    const timeField = embed.fields?.find((field) => field.name === "⏳ Timp pentru completare");

    expect(timeField?.value).toContain(`<t:${Math.floor(deadline / 1000)}:R>`);
    expect(timeField?.value).toContain("Dacă rămâne incomplet");
  });

  it("puts the first five staff questions on the first valid modal page", () => {
    const staffModal = ticketModal("staff").toJSON();
    const partnershipModal = ticketModal("partnership").toJSON();

    expect(staffModal.title).toBe("Aplicare Staff · 1/2");
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

    expect(detailsModal.title).toBe("Aplicare Staff · 2/2");
    expect(detailsModal.components).toHaveLength(3);
    expect(detailIds).toEqual(["staff_conflict", "staff_improvements", "staff_tag"]);
  });

  it("uses a second interactive step for the final partnership questions", () => {
    const detailsModal = partnershipDetailsModal().toJSON();
    const detailIds = detailsModal.components.flatMap((row) =>
      "components" in row
        ? row.components.flatMap((component) =>
            "custom_id" in component ? [component.custom_id] : [],
          )
        : [],
    );

    expect(detailsModal.title).toBe("Propunere de Parteneriat · 2/2");
    expect(detailsModal.components).toHaveLength(3);
    expect(detailIds).toEqual([
      "partnership_motivation",
      "partnership_offer",
      "partnership_terms",
    ]);
  });

  it("routes alliance edit submissions through the ticket modal dispatcher", () => {
    expect(
      partnershipEditModal("123", {
        server_name: "Regatul Umbrelor",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
      }).toJSON().custom_id,
    ).toBe("ticket_form_alliance_edit_submit_123");
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

  it("summons the staff role with a medieval Oracle review after completion", () => {
    const payload = staffOracleReviewPayload("Andrei");
    expect(payload.content).toBe(`<@&${STAFF_REVIEW_ROLE_ID}>`);
    expect(payload.allowedMentions.roles).toEqual([STAFF_REVIEW_ROLE_ID]);
    expect(payload.embeds[0]?.toJSON().title).toBe("🕯️ Cuvântul Oracolului");
    expect(payload.embeds[0]?.toJSON().description).toContain("Andrei");
  });
});