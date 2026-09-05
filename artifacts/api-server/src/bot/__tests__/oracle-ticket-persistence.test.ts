import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonInteraction } from "discord.js";

type StoredProgress = {
  currentStep: number;
  panelMessageId: string;
  applicantUsername?: string;
  answers?: Record<string, string>;
  alliancePosted?: boolean;
  alliancePublishing?: boolean;
  alliancePublishClaimedAt?: number;
  alliancePublicMessageId?: string;
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
    loadAllianceRecruitmentText: vi.fn(async () => null),
    loadTicketProgress: vi.fn(async (channelId: string, applicantId: string) =>
      clone(persistence.records.get(key(channelId, applicantId)))),
    saveTicketProgress: vi.fn(async (
      channelId: string,
      applicantId: string,
      progress: StoredProgress,
    ) => {
      persistence.records.set(key(channelId, applicantId), structuredClone(progress));
    }),
    claimTicketAlliancePublication: vi.fn(async (
      channelId: string,
      applicantId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (
        !current ||
        current.status !== "completed" ||
        current.alliancePosted ||
        current.alliancePublishing
      ) {
        return null;
      }
      const claimed = {
        ...current,
        alliancePublishing: true,
        alliancePublishClaimedAt: Date.now(),
      };
      persistence.records.set(recordKey, claimed);
      return clone(claimed);
    }),
    finishTicketAlliancePublication: vi.fn(async (
      channelId: string,
      applicantId: string,
      publicMessageId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (!current?.alliancePublishing) return null;
      const finished = {
        ...current,
        alliancePosted: true,
        alliancePublishing: false,
        alliancePublicMessageId: publicMessageId,
      };
      persistence.records.set(recordKey, finished);
      return clone(finished);
    }),
    releaseTicketAlliancePublication: vi.fn(async (
      channelId: string,
      applicantId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (!current?.alliancePublishing) return null;
      const released = { ...current, alliancePublishing: false };
      persistence.records.set(recordKey, released);
      return clone(released);
    }),
  };
});

const STAFF_REVIEW_ROLE_ID = "1472526137308745909";

const completedDraft = (): StoredProgress => ({
  currentStep: 8,
  panelMessageId: "panel-1",
  applicantUsername: "Andrei",
  answers: {
    server_name: "Regatul Umbrelor",
    representative: "Andrei",
    invite: "https://discord.gg/umbrelor",
    members: "150 total · 60 activi",
    description: "Comunitate RPG medievală.",
    motivation: "Dorim o alianță.",
    offer: "Promovare reciprocă.",
    terms: "Acceptăm regulile.",
  },
  status: "completed",
});

function makeInteraction(
  customId: string,
  channelId: string,
  publicSend = vi.fn(async () => ({ id: "public-message-1" })),
) {
  const reply = vi.fn(async (_payload: unknown): Promise<void> => undefined);
  const update = vi.fn(async (_payload: unknown): Promise<void> => undefined);
  const followUp = vi.fn(async (_payload: unknown): Promise<void> => undefined);
  const showModal = vi.fn(async (_modal: { toJSON(): unknown }): Promise<void> => undefined);
  const interaction = {
    customId,
    channelId,
    member: { roles: [STAFF_REVIEW_ROLE_ID] },
    memberPermissions: { has: vi.fn(() => true) },
    client: {
      channels: {
        fetch: vi.fn(async () => ({
          isTextBased: () => true,
          send: publicSend,
        })),
      },
    },
    reply,
    update,
    followUp,
    showModal,
  };
  return {
    interaction: interaction as unknown as ButtonInteraction,
    publicSend,
    reply,
    update,
    followUp,
    showModal,
  };
}

async function freshTicketUi() {
  vi.resetModules();
  return import("../ticket-ui");
}

describe("persistent alliance publication flow", () => {
  beforeEach(() => {
    persistence.records.clear();
    vi.clearAllMocks();
  });

  it("reloads a completed draft after restart for confirm, edit, and publish actions", async () => {
    persistence.records.set("restart-ticket:101", completedDraft());
    const { handleTicketButton } = await freshTicketUi();

    const confirm = makeInteraction("ticket_alliance_confirm_101", "restart-ticket");
    expect(await handleTicketButton(confirm.interaction)).toBe(true);
    expect(confirm.update).toHaveBeenCalledOnce();
    const confirmPayload = confirm.update.mock.calls[0]![0] as {
      components: { toJSON(): { components: { custom_id?: string }[] } }[];
    };
    expect(confirmPayload.components[0]!.toJSON().components.map((button) => button.custom_id)).toEqual([
      "ticket_alliance_post_101",
      "ticket_alliance_edit_101",
    ]);

    const edit = makeInteraction("ticket_alliance_edit_101", "restart-ticket");
    expect(await handleTicketButton(edit.interaction)).toBe(true);
    expect(edit.showModal).toHaveBeenCalledOnce();
    const editModal = edit.showModal.mock.calls[0]![0].toJSON() as { custom_id: string };
    expect(editModal.custom_id).toBe("ticket_form_alliance_edit_submit_101");

    const publish = makeInteraction("ticket_alliance_post_101", "restart-ticket");
    expect(await handleTicketButton(publish.interaction)).toBe(true);
    expect(publish.publicSend).toHaveBeenCalledOnce();
    expect(publish.update).toHaveBeenCalledOnce();
    expect(persistence.records.get("restart-ticket:101")).toMatchObject({
      alliancePosted: true,
      alliancePublishing: false,
      alliancePublicMessageId: "public-message-1",
    });
  });

  it("allows only one announcement for concurrent publish clicks", async () => {
    persistence.records.set("race-ticket:202", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const publicSend = vi.fn(async () => ({ id: "public-race-message" }));
    const first = makeInteraction("ticket_alliance_post_202", "race-ticket", publicSend);
    const second = makeInteraction("ticket_alliance_post_202", "race-ticket", publicSend);

    await Promise.all([
      handleTicketButton(first.interaction),
      handleTicketButton(second.interaction),
    ]);

    expect(publicSend).toHaveBeenCalledOnce();
    expect(first.update.mock.calls.length + second.update.mock.calls.length).toBe(1);
    const duplicateReply = [...first.reply.mock.calls, ...second.reply.mock.calls]
      .map(([payload]) => (payload as { content?: string }).content)
      .find((content) => content?.includes("deja") || content?.includes("în curs"));
    expect(duplicateReply).toBeDefined();
    expect(persistence.records.get("race-ticket:202")).toMatchObject({
      alliancePosted: true,
      alliancePublishing: false,
      alliancePublicMessageId: "public-race-message",
    });
  });

  it("does not republish an already published draft", async () => {
    persistence.records.set("published-ticket:303", {
      ...completedDraft(),
      alliancePosted: true,
      alliancePublishing: false,
      alliancePublicMessageId: "existing-message",
    });
    const { handleTicketButton } = await freshTicketUi();
    const attempt = makeInteraction("ticket_alliance_post_303", "published-ticket");

    expect(await handleTicketButton(attempt.interaction)).toBe(true);
    expect(attempt.publicSend).not.toHaveBeenCalled();
    expect(attempt.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: "✅ Alianța a fost deja publicată.",
    }));
  });

  it("reports a publication already in progress without sending again", async () => {
    persistence.records.set("publishing-ticket:404", {
      ...completedDraft(),
      alliancePublishing: true,
      alliancePublishClaimedAt: Date.now(),
    });
    const { handleTicketButton } = await freshTicketUi();
    const attempt = makeInteraction("ticket_alliance_post_404", "publishing-ticket");

    expect(await handleTicketButton(attempt.interaction)).toBe(true);
    expect(attempt.publicSend).not.toHaveBeenCalled();
    expect(attempt.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("deja în curs"),
    }));
  });

  it("releases a failed send so the draft can be retried", async () => {
    persistence.records.set("failure-ticket:505", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const failedSend = vi.fn(async () => {
      throw new Error("Discord send failed");
    });
    const failed = makeInteraction("ticket_alliance_post_505", "failure-ticket", failedSend);

    expect(await handleTicketButton(failed.interaction)).toBe(true);
    expect(failedSend).toHaveBeenCalledOnce();
    expect(failed.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("nu a putut fi publicat"),
    }));
    const released = persistence.records.get("failure-ticket:505");
    expect(released?.alliancePosted).not.toBe(true);
    expect(released?.alliancePublishing).toBe(false);

    const retry = makeInteraction("ticket_alliance_post_505", "failure-ticket");
    expect(await handleTicketButton(retry.interaction)).toBe(true);
    expect(retry.publicSend).toHaveBeenCalledOnce();
    expect(persistence.records.get("failure-ticket:505")).toMatchObject({
      alliancePosted: true,
      alliancePublishing: false,
    });
  });
});