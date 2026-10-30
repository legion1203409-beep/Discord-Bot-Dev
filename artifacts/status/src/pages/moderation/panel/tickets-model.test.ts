import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  TICKETS_MODULES, addQuestion, alliancePublishingOn, changedTicketParts, deadlinesProblem, deadlinesSummary, duplicateKeys, editFlow,
  flowSummary, isFlowOn, isTicketsModuleChanged, isTicketsRoute, moveQuestion, notifiesStaff, partnershipFieldsByQuestion, questionKey,
  removeQuestion, setQuestion, ticketsDraftError, ticketsModuleForRoute, type TicketFlow,
} from "./tickets-model";

const question = (key: string) => ({ key, label: `Întrebarea ${key}`, description: "Răspunde clar.", placeholder: "Răspuns", multiline: false, required: true });
const flow = (keys: string[], change: Partial<TicketFlow> = {}): TicketFlow => ({
  mode: "custom", title: "Panou", startButtonLabel: "Începe", panelDescription: "Descriere", requirementsText: "Ghid",
  completionMessage: "Gata", staffNotificationMessage: "Staff", completionAction: "notify_staff", questions: keys.map(question), ...change,
});
const config = () => ({
  allianceRecruitmentText: "",
  tickets: {
    categories: { staff: "100000000000000001", partnership: "", help_report: "100000000000000003", appeal: "" },
    staffReviewRoleId: "200000000000000002", alliancePublicChannelId: "", allianceOwnerGuildId: "111111111",
    allianceAnnouncementImageUrl: "", allianceAnnouncementThumbnailUrl: "",
    incompleteTimeoutMinutes: 60, firstWarningMinutes: 20, secondWarningMinutes: 50,
    flows: {
      staff: flow(["name", "age"]), partnership: flow(["server_name", "invite"]),
      help_report: flow(["type"]), appeal: flow(["case_id", "reason"]),
    },
  },
});

describe("the tickets group", () => {
  it("is its own page, apart from the verification, with four flows and the common settings", () => {
    expect(TICKETS_MODULES.map((module) => module.route)).toEqual([
      "/tichete/aplicatii", "/tichete/parteneriate", "/tichete/ajutor", "/tichete/contestatii", "/tichete/setari",
    ]);
    expect(ticketsModuleForRoute("/tichete").id).toBe("staff");
    expect(ticketsModuleForRoute("/tichete/contestatii/").id).toBe("appeal");
    expect(isTicketsRoute("/tichete/setari")).toBe(true);
    expect(isTicketsRoute("/verificare")).toBe(false);
    expect(panelGroupRoute("/tichete/ajutor")).toBe("/tichete");
    expect(isWidePanelRoute("/tichete")).toBe(true);
  });

  it("marks only the module whose part changed", () => {
    const saved = config();
    const draft = config();
    draft.tickets.firstWarningMinutes = 10;
    draft.tickets.allianceOwnerGuildId = "";
    expect(TICKETS_MODULES.map((module) => isTicketsModuleChanged(module, saved, draft))).toEqual([false, true, false, false, true]);
    expect(changedTicketParts(saved, draft).map((part) => part.label)).toEqual(["Parteneriate", "Setări comune"]);
  });

  it("calls a flow on only with a category", () => {
    expect(isFlowOn(config(), "staff")).toBe(true);
    expect(isFlowOn(config(), "partnership")).toBe(false);
    expect(flowSummary(config(), "staff")).toBe("2 întrebări");
    expect(flowSummary(config(), "appeal")).toBe("Fără categorie");
  });
});

describe("the questions of a flow", () => {
  it("adds questions with unique keys, up to twenty", () => {
    let current = flow(["intrebare_2"]);
    current = addQuestion(current);
    expect(current.questions.map((item) => item.key)).toEqual(["intrebare_2", "intrebare_3"]);
    expect(current.postedQuestionKeys).toEqual(["intrebare_2", "intrebare_3"]);
    const full = flow(Array.from({ length: 20 }, (_, index) => `q${index}`));
    expect(addQuestion(full)).toBe(full);
  });

  it("keeps at least one question and the case question first in appeals", () => {
    expect(removeQuestion("staff", flow(["a"]), 0).questions).toHaveLength(1);
    const appeal = flow(["case_id", "reason", "proof"]);
    expect(removeQuestion("appeal", appeal, 0)).toBe(appeal);
    expect(moveQuestion("appeal", appeal, 1, -1)).toBe(appeal);
    expect(moveQuestion("appeal", appeal, 1, 1).questions.map((item) => item.key)).toEqual(["case_id", "proof", "reason"]);
    expect(removeQuestion("appeal", appeal, 2).questions.map((item) => item.key)).toEqual(["case_id", "reason"]);
  });

  it("renames keys in the list of posted answers and makes the flow custom", () => {
    const legacy = flow(["a", "b"], { mode: "legacy", postedQuestionKeys: ["a", "b"] });
    const renamed = setQuestion(legacy, 0, { key: "nume" });
    expect(renamed.mode).toBe("custom");
    expect(renamed.postedQuestionKeys).toEqual(["nume", "b"]);
    expect(editFlow(legacy, { title: "Nou" }).mode).toBe("custom");
  });

  it("writes keys the server accepts and finds duplicates", () => {
    expect(questionKey("Vârstă și Țară!")).toBe("varsta_si_tara_");
    expect(duplicateKeys(flow(["a", "b", "a"]))).toEqual(["a"]);
  });

  it("only notifies the staff when the flow asks for it", () => {
    expect(notifiesStaff(flow(["a"]))).toBe(true);
    expect(notifiesStaff(flow(["a"], { completionAction: "lock" }))).toBe(false);
    expect(notifiesStaff(flow(["a"], { completionAction: "keep_open" }))).toBe(false);
  });
});

describe("partnerships", () => {
  it("shows which alliance field each question fills, by key or else by position", () => {
    const fields = partnershipFieldsByQuestion(flow(["invite", "nume", "server_name"]));
    expect(fields[0]).toEqual(["linkul serverului"]);
    expect(fields[1]).toEqual(["reprezentantul"]);
    expect(fields[2]).toEqual(["numele serverului"]);
  });

  it("publishes alliances only on the server named in the settings", () => {
    expect(alliancePublishingOn(config(), "111111111")).toBe(true);
    expect(alliancePublishingOn(config(), "999999999")).toBe(false);
    expect(alliancePublishingOn({ tickets: { allianceOwnerGuildId: "" } }, "111111111")).toBe(false);
  });
});

describe("deadlines and checks before saving", () => {
  it("wants the two warnings before the deletion, in order", () => {
    expect(deadlinesProblem(config().tickets)).toBeNull();
    expect(deadlinesProblem({ ...config().tickets, firstWarningMinutes: 50 })).toMatch(/înaintea celui de-al doilea/);
    expect(deadlinesProblem({ ...config().tickets, secondWarningMinutes: 60 })).toMatch(/înainte de ștergerea/);
    expect(deadlinesProblem({ ...config().tickets, incompleteTimeoutMinutes: 5 })).toMatch(/între 10 și 240/);
    expect(deadlinesSummary(config())).toBe("Șterse după 60 de minute");
  });

  it("accepts a valid draft and names the module of the first problem", () => {
    expect(ticketsDraftError(config())).toBeNull();
    const noRole = config();
    noRole.tickets.staffReviewRoleId = "";
    expect(ticketsDraftError(noRole)).toMatch(/^Setări comune — Alege rolul/);
    const emptyTitle = config();
    emptyTitle.tickets.flows.help_report.title = " ";
    expect(ticketsDraftError(emptyTitle)).toBe("Ajutor și raportări — Titlul panoului nu poate fi gol.");
    const badKey = config();
    badKey.tickets.flows.staff.questions[1]!.key = "Vârstă";
    expect(ticketsDraftError(badKey)).toMatch(/^Aplicații staff — Întrebarea 2: cheia/);
    const twice = config();
    twice.tickets.flows.partnership.questions[1]!.key = "server_name";
    expect(ticketsDraftError(twice)).toMatch(/server_name/);
    const longLabel = config();
    longLabel.tickets.flows.appeal.questions[1]!.label = "x".repeat(46);
    expect(ticketsDraftError(longLabel)).toMatch(/cel mult 45/);
  });
});
