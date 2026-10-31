import { describe, expect, it } from "vitest";
import { isWidePanelRoute } from "./model";
import {
  PANEL_COMMANDS, actionErrorText, availableCommands, commandBlock, commandPayload, commandProblem, commandSentence, emptyCommandForm,
  isCommandsRoute, minutesText, panelCommand, secondsText, type CommandForm,
} from "./commands-model";

const MEMBER = "200000000000000002";
const CHANNEL = "300000000000000004";
const ROLE = "400000000000000005";
const form = (change: Partial<CommandForm>): CommandForm => ({ ...emptyCommandForm(change.type), ...change });

describe("the commands page", () => {
  it("lists the eleven commands the bot accepts from the panel", () => {
    expect(PANEL_COMMANDS.map((command) => command.key)).toEqual(["warn", "mute", "unmute", "kick", "ban", "nick", "role", "purge", "slowmode", "lock", "unlock"]);
    expect(panelCommand("ban")).toMatchObject({ label: "Interdicție", danger: true, needs: "member", permission: "Ban Members" });
    expect(panelCommand("nu-există").key).toBe("warn");
    expect(isCommandsRoute("/comenzi/")).toBe(true);
    expect(isWidePanelRoute("/comenzi")).toBe(true);
  });

  it("knows which commands the bot would refuse", () => {
    const config = { manualTools: { enabled: true, disabledCommands: ["purge"] } };
    expect(commandBlock(config, "warn")).toBeNull();
    expect(commandBlock(config, "purge")).toBe("Comanda /purge e oprită pentru toți.");
    expect(commandBlock({ manualTools: { enabled: false } }, "warn")).toContain("oprite");
    expect(commandBlock(null, "warn")).toBeNull();
    expect(availableCommands(config)).toBe(10);
    expect(availableCommands({ manualTools: { enabled: false } })).toBe(0);
  });

  it("checks the form before anything is sent", () => {
    expect(commandProblem(form({ type: "warn" }))).toContain("Scrie membrul");
    expect(commandProblem(form({ type: "warn", member: "Ana" }))).toContain("Copiază ID-ul");
    expect(commandProblem(form({ type: "warn", member: `<@${MEMBER}>` }))).toBeNull();
    expect(commandProblem(form({ type: "mute", member: MEMBER, durationMinutes: 0 }))).toContain("28 de zile");
    expect(commandProblem(form({ type: "mute", member: MEMBER, durationMinutes: 40_321 }))).toContain("28 de zile");
    expect(commandProblem(form({ type: "nick", member: MEMBER, nickname: "  " }))).toBe("Scrie porecla nouă.");
    expect(commandProblem(form({ type: "role", member: MEMBER }))).toBe("Alege rolul.");
    expect(commandProblem(form({ type: "role", allMembers: true, roleId: ROLE }))).toBeNull();
    expect(commandProblem(form({ type: "purge", channelId: CHANNEL, amount: 101 }))).toContain("între 1 și 100");
    expect(commandProblem(form({ type: "slowmode", channelId: CHANNEL, amount: 0 }))).toBeNull();
    expect(commandProblem(form({ type: "lock", channelId: "general" }))).toBe("Alege canalul.");
    expect(commandProblem(form({ type: "warn", member: MEMBER, reason: "x".repeat(501) }))).toContain("500");
  });

  it("sends only what the command uses", () => {
    expect(commandPayload(form({ type: "warn", member: `https://discord.com/users/${MEMBER}`, channelId: CHANNEL, reason: "  spam " })))
      .toEqual({ type: "warn", targetId: MEMBER, reason: "spam" });
    expect(commandPayload(form({ type: "mute", member: MEMBER, durationMinutes: 60 }))).toEqual({ type: "mute", targetId: MEMBER, durationMinutes: 60 });
    expect(commandPayload(form({ type: "role", member: MEMBER, roleId: ROLE, allMembers: true }))).toEqual({ type: "role", allMembers: true, roleId: ROLE });
    expect(commandPayload(form({ type: "role", member: MEMBER, roleId: ROLE }))).toEqual({ type: "role", targetId: MEMBER, roleId: ROLE });
    expect(commandPayload(form({ type: "slowmode", channelId: CHANNEL, amount: 0 }))).toEqual({ type: "slowmode", channelId: CHANNEL, amount: 0 });
    expect(commandPayload(form({ type: "nick", member: MEMBER, nickname: " Ana " }))).toEqual({ type: "nick", targetId: MEMBER, nickname: "Ana" });
  });

  it("says what will happen before it happens", () => {
    expect(commandSentence(form({ type: "mute", member: MEMBER, durationMinutes: 90 }), { member: "Ana" })).toBe("Ana primește timeout pentru 1 oră și 30 de minute.");
    expect(commandSentence(form({ type: "ban", member: MEMBER }))).toBe(`${MEMBER} primește interdicție pe server.`);
    expect(commandSentence(form({ type: "purge", channelId: CHANNEL, amount: 25 }), { channel: "#general" })).toBe("Se șterg ultimele 25 de mesaje din #general.");
    expect(commandSentence(form({ type: "slowmode", channelId: CHANNEL, amount: 0 }), { channel: "#general" })).toBe("#general nu mai are slowmode.");
    expect(commandSentence(form({ type: "role", allMembers: true, roleId: ROLE }), { role: "rolul @Membru" })).toBe("Toți membrii care pot primi rolul @Membru îl primesc.");
  });

  it("writes durations the Romanian way", () => {
    expect(minutesText(10)).toBe("10 minute");
    expect(minutesText(60)).toBe("1 oră");
    expect(minutesText(1_500)).toBe("1 zi și 1 oră");
    expect(minutesText(40_320)).toBe("28 de zile");
    expect(minutesText(1_561)).toBe("1 zi, 2 ore și 1 minut");
    expect(secondsText(0)).toBe("fără pauză");
    expect(secondsText(30)).toBe("30 de secunde");
    expect(secondsText(90)).toBe("1 minut și 30 de secunde");
  });

  it("explains a refusal that needs checking in the audit log", () => {
    expect(actionErrorText(409, "Action requires operator reconciliation")).toMatchObject({ toAudit: true });
    expect(actionErrorText(400, "Nu ai permisiunea necesară pentru această comandă de moderare.")).toEqual({
      text: "Nu ai permisiunea necesară pentru această comandă de moderare.", toAudit: false,
    });
    expect(actionErrorText(403, "Forbidden").text).toContain("Acces staff");
    expect(actionErrorText(null, "").text).toBe("Acțiunea nu a putut fi trimisă.");
  });
});
