import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import {
  DEFAULT_TICKET_CONFIG,
  setTicketConfig,
  type TicketCategoryKind,
  type TicketFlowConfig,
  type TicketQuestionConfig,
} from "../ticket-config";
import {
  handleTicketButton,
  handleTicketQuestionModal,
  ticketPanelPayload,
  ticketQuestionModal,
} from "../ticket-ui";

type StoredProgress = {
  currentStep: number;
  panelMessageId: string;
  applicantUsername?: string;
  responseMessageId?: string;
  answers?: Record<string, string>;
  status?: "completed" | "rejected";
};

const persistence = vi.hoisted(() => ({
  records: new Map<string, StoredProgress>(),
}));

vi.mock("../db", () => {
  const key = (channelId: string, applicantId: string) => `${channelId}:${applicantId}`;
  const clone = (value: StoredProgress | undefined): StoredProgress | null =>
    value ? structuredClone(value) : null;

  return {
    claimTicketAlliancePublication: vi.fn(),
    finishTicketAlliancePublication: vi.fn(),
    loadAllianceRecruitmentText: vi.fn(async () => null),
    loadTicketProgress: vi.fn(async (channelId: string, applicantId: string) =>
      clone(persistence.records.get(key(channelId, applicantId))),
    ),
    rejectTicketAlliance: vi.fn(),
    releaseTicketAlliancePublication: vi.fn(),
    saveTicketProgress: vi.fn(async (
      channelId: string,
      applicantId: string,
      progress: StoredProgress,
    ) => {
      persistence.records.set(key(channelId, applicantId), structuredClone(progress));
    }),
  };
});

const GUILD_ID = "211111111111111111";
const STAFF_ROLE_ID = "222222222222222222";
const USER_ID = "333333333333333333";

function questionConfig(key: string, overrides: Partial<TicketQuestionConfig> = {}): TicketQuestionConfig {
  return {
    key,
    label: `Întrebarea ${key}`,
    description: `Descrierea pentru ${key}`,
    placeholder: `Răspuns pentru ${key}`,
    multiline: false,
    required: true,
    ...overrides,
  };
}

function customFlow(
  kind: TicketCategoryKind,
  completionAction: TicketFlowConfig["completionAction"],
  questions = [questionConfig(`${kind}_question`)],
  postedQuestionKeys?: string[],
): TicketFlowConfig {
  return {
    mode: "custom",
    title: `Flux personalizat ${kind}`,
    startButtonLabel: `Începe ${kind}`,
    panelDescription: `Panou configurat pentru ${kind}`,
    requirementsText: `Cerințe configurate pentru ${kind}`,
    completionMessage: `Mesaj final configurat pentru ${kind}`,
    staffNotificationMessage: `Notificare staff configurată pentru ${kind}`,
    completionAction,
    questions,
    ...(postedQuestionKeys ? { postedQuestionKeys } : {}),
  };
}

function configureFlows(flows: Partial<Record<TicketCategoryKind, TicketFlowConfig>>) {
  setTicketConfig(GUILD_ID, {
    ...DEFAULT_TICKET_CONFIG,
    staffReviewRoleId: STAFF_ROLE_ID,
    flows: {
      ...DEFAULT_TICKET_CONFIG.flows,
      ...flows,
    },
  });
}

function panelMessage(kind: TicketCategoryKind) {
  return {
    id: "panel-1",
    components: [{ components: [{ customId: `ticket_start_${kind}` }] }],
    edit: vi.fn(async () => undefined),
  };
}

function makeStartInteraction(kind: TicketCategoryKind) {
  const showModal = vi.fn(async (_modal: { toJSON(): unknown }) => undefined);
  const interaction = {
    customId: `ticket_start_${kind}`,
    channelId: `custom-${kind}-channel`,
    guildId: GUILD_ID,
    user: {
      id: USER_ID,
      username: "Applicant",
      globalName: "Applicant",
    },
    message: panelMessage(kind),
    showModal,
  };
  return {
    interaction: interaction as unknown as ButtonInteraction,
    showModal,
  };
}

function makeAnswerInteraction(
  kind: TicketCategoryKind,
  key: string,
  value: string,
  channelId: string,
) {
  const sentPayloads: unknown[] = [];
  const panel = panelMessage(kind);
  const editReply = vi.fn(async (_payload: unknown) => undefined);
  const responseMessage = { id: `response-${key}` };
  const channel = {
    isTextBased: () => true,
    send: vi.fn(async (payload: unknown) => {
      sentPayloads.push(payload);
      return responseMessage;
    }),
    messages: {
      fetch: vi.fn(async () => panel),
    },
  };
  const interaction = {
    customId: `ticket_answer_${kind}_${key}`,
    channelId,
    guildId: GUILD_ID,
    user: {
      id: USER_ID,
      username: "Applicant",
      globalName: "Applicant",
      displayAvatarURL: () => "https://example.com/avatar.png",
    },
    fields: {
      getTextInputValue: vi.fn(() => value),
    },
    channel,
    deferReply: vi.fn(async () => undefined),
    editReply,
  };
  return {
    interaction: interaction as unknown as ModalSubmitInteraction,
    channel,
    panel,
    editReply,
    sentPayloads,
  };
}

function embedJson(payload: unknown) {
  const candidate = payload as {
    embeds?: { toJSON(): { fields?: { name?: string }[] } }[];
  };
  return candidate.embeds?.[0]?.toJSON() ?? {};
}

describe("custom ticket flows in Discord", () => {
  beforeEach(() => {
    persistence.records.clear();
    vi.clearAllMocks();
  });

  it("starts a new custom flow with the configured first question instead of the legacy form", async () => {
    const questions = [
      questionConfig("added_first"),
      questionConfig("reordered_second"),
    ];
    configureFlows({ staff: customFlow("staff", "keep_open", questions) });

    const panel = ticketPanelPayload("staff", undefined, GUILD_ID);
    const panelEmbed = panel.embeds[0]!.toJSON();
    expect(panelEmbed.title).toBe("Flux personalizat staff");
    expect(panelEmbed.description).toBe("Panou configurat pentru staff");
    expect(panelEmbed.fields?.[0]?.value).toContain("2 întrebări");

    const started = makeStartInteraction("staff");
    expect(await handleTicketButton(started.interaction)).toBe(true);
    const modal = started.showModal.mock.calls[0]?.[0].toJSON() as { custom_id: string };
    expect(modal.custom_id).toBe("ticket_answer_staff_added_first");
    expect(persistence.records.get("custom-staff-channel:333333333333333333")).toMatchObject({
      currentStep: 0,
      panelMessageId: "panel-1",
    });

    expect(ticketQuestionModal("staff", "reordered_second", GUILD_ID)?.toJSON().custom_id).toBe(
      "ticket_answer_staff_reordered_second",
    );
  });

  it.each(["staff", "partnership", "help_report"] as const)(
    "opens the custom first question for the %s ticket type",
    async (kind) => {
      configureFlows({
        [kind]: customFlow(kind, "keep_open", [questionConfig(`${kind}_custom_first`)]),
      });
      const started = makeStartInteraction(kind);

      expect(await handleTicketButton(started.interaction)).toBe(true);
      expect(
        (started.showModal.mock.calls[0]?.[0].toJSON() as { custom_id: string }).custom_id,
      ).toBe(`ticket_answer_${kind}_${kind}_custom_first`);
    },
  );

  it("keeps added, deleted, and reordered questions in the configured progression", async () => {
    const questions = [
      questionConfig("added"),
      questionConfig("original_first"),
      questionConfig("original_third"),
    ];
    configureFlows({ help_report: customFlow("help_report", "keep_open", questions) });
    const channelId = "custom-progress-channel";
    const started = makeStartInteraction("help_report");
    (started.interaction as unknown as { channelId: string }).channelId = channelId;

    await handleTicketButton(started.interaction);
    expect(
      (started.showModal.mock.calls[0]?.[0].toJSON() as { custom_id: string }).custom_id,
    ).toBe("ticket_answer_help_report_added");

    const first = makeAnswerInteraction("help_report", "added", "Răspuns nou", channelId);
    await handleTicketQuestionModal(first.interaction);
    expect(persistence.records.get(`${channelId}:${USER_ID}`)).toMatchObject({
      currentStep: 1,
      answers: { added: "Răspuns nou" },
    });
    const firstReply = first.editReply.mock.calls[0]?.[0] as {
      components?: { toJSON(): { components: { custom_id?: string }[] } }[];
    };
    expect(firstReply.components?.[0]?.toJSON().components[0]?.custom_id).toBe(
      "ticket_next_help_report_2",
    );

    const second = makeAnswerInteraction("help_report", "original_first", "Răspuns vechi", channelId);
    await handleTicketQuestionModal(second.interaction);
    expect(persistence.records.get(`${channelId}:${USER_ID}`)).toMatchObject({
      currentStep: 2,
      answers: { added: "Răspuns nou", original_first: "Răspuns vechi" },
    });

    const third = makeAnswerInteraction("help_report", "original_third", "Ultimul răspuns", channelId);
    await handleTicketQuestionModal(third.interaction);
    const completed = persistence.records.get(`${channelId}:${USER_ID}`);
    expect(completed).toMatchObject({
      currentStep: 3,
      status: "completed",
      answers: {
        added: "Răspuns nou",
        original_first: "Răspuns vechi",
        original_third: "Ultimul răspuns",
      },
    });
    expect(embedJson(third.sentPayloads[0]).fields?.map((field: { name?: string }) => field.name)).toEqual([
      "Întrebarea added",
      "Întrebarea original_first",
      "Întrebarea original_third",
    ]);
    expect(completed?.answers).not.toHaveProperty("deleted_question");
  });

  it("posts only the selected questions in the completed custom summary", async () => {
    const questions = [
      questionConfig("visible_first"),
      questionConfig("hidden_middle"),
      questionConfig("visible_last"),
    ];
    configureFlows({
      help_report: customFlow("help_report", "keep_open", questions, ["visible_first", "visible_last"]),
    });
    const channelId = "custom-selected-summary-channel";
    const started = makeStartInteraction("help_report");
    (started.interaction as unknown as { channelId: string }).channelId = channelId;

    await handleTicketButton(started.interaction);
    let completionPayloads: unknown[] = [];
    for (const [key, value] of [
      ["visible_first", "Primul răspuns"],
      ["hidden_middle", "Răspunsul ascuns"],
      ["visible_last", "Ultimul răspuns"],
    ] as const) {
      const answer = makeAnswerInteraction("help_report", key, value, channelId);
      await handleTicketQuestionModal(answer.interaction);
      completionPayloads = answer.sentPayloads;
    }

    const completed = persistence.records.get(`${channelId}:${USER_ID}`);
    expect(completed?.status).toBe("completed");
    expect(embedJson(completionPayloads[0]).fields?.map((field: { name?: string }) => field.name)).toEqual([
      "Întrebarea visible_first",
      "Întrebarea visible_last",
    ]);
  });

  it.each([
    ["staff", "lock"],
    ["partnership", "notify_staff"],
    ["help_report", "keep_open"],
  ] as const)(
    "applies the configured %s completion action (%s), messages, and staff role",
    async (kind, completionAction) => {
      configureFlows({
        [kind]: customFlow(kind, completionAction, [questionConfig(`${kind}_only`)]),
      });
      const channelId = `action-${kind}-channel`;
      persistence.records.set(`${channelId}:${USER_ID}`, {
        currentStep: 0,
        panelMessageId: "panel-1",
        applicantUsername: "Applicant",
      });

      const answer = makeAnswerInteraction(kind, `${kind}_only`, "Răspuns final", channelId);
      expect(await handleTicketQuestionModal(answer.interaction)).toBe(true);

      const sent = answer.sentPayloads[0] as {
        content?: string;
        allowedMentions?: { roles?: string[] };
      };
      const completionReply = answer.editReply.mock.calls.at(-1)?.[0] as { content?: string };
      expect(completionReply.content).toBe(`Mesaj final configurat pentru ${kind}`);

      if (completionAction === "notify_staff") {
        expect(sent.content).toBe(
          `<@&${STAFF_ROLE_ID}>\nNotificare staff configurată pentru ${kind}`,
        );
        expect(sent.allowedMentions?.roles).toEqual([STAFF_ROLE_ID]);
      } else {
        expect(sent.content).toBeUndefined();
        expect(sent.allowedMentions?.roles).toBeUndefined();
      }

      if (completionAction === "keep_open") {
        expect(answer.channel.messages.fetch).not.toHaveBeenCalled();
        expect(answer.panel.edit).not.toHaveBeenCalled();
      } else {
        expect(answer.channel.messages.fetch).toHaveBeenCalledWith("panel-1");
        expect(answer.panel.edit).toHaveBeenCalled();
      }
    },
  );
});