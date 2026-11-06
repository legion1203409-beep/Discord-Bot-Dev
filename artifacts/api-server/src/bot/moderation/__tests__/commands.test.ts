import { describe, expect, it } from "vitest";
import { moderationCommandErrorText } from "../commands";
import { ModerationActionStateError, ModerationActionUncertainError } from "../engine";

describe("what a refused staff command answers", () => {
  it("shows the bot's own refusals as they are", () => {
    expect(moderationCommandErrorText(new Error("Comanda /purge este oprită pe acest server."))).toBe("Comanda /purge este oprită pe acest server.");
    expect(moderationCommandErrorText(new Error("Nu ai permisiunea necesară pentru această comandă de moderare.")))
      .toBe("Nu ai permisiunea necesară pentru această comandă de moderare.");
    expect(moderationCommandErrorText(new ModerationActionUncertainError())).toMatch(/registrul nu a putut fi finalizat/);
    expect(moderationCommandErrorText(new ModerationActionStateError("MODERATION_ACTION_PENDING", "Acțiunea este încă în așteptare.")))
      .toBe("Acțiunea este încă în așteptare.");
  });

  it("keeps unexpected failures general, so internal details stay in the logs", () => {
    class DatabaseError extends Error { code = "42P01"; }
    expect(moderationCommandErrorText(new DatabaseError('relation "moderation_cases" does not exist'))).toMatch(/^Acțiunea de moderare nu a putut fi aplicată/);
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    expect(moderationCommandErrorText(refused)).toMatch(/^Acțiunea de moderare nu a putut fi aplicată/);
    expect(moderationCommandErrorText("boom")).toMatch(/^Acțiunea de moderare nu a putut fi aplicată/);
    expect(moderationCommandErrorText(new Error(""))).toMatch(/^Acțiunea de moderare nu a putut fi aplicată/);
  });
});

describe("a reason is required for warn, mute and ban", () => {
  it("refuses a missing or blank reason and lets the other commands go without one", async () => {
    const { missingReasonText } = await import("../commands");
    expect(missingReasonText("warn", undefined)).toMatch(/Scrie motivul pentru \/warn/);
    expect(missingReasonText("ban", "   ")).toMatch(/\/ban/);
    expect(missingReasonText("mute", "ok")).toMatch(/cel puțin 3/);
    expect(missingReasonText("mute", "spam în chat")).toBeNull();
    expect(missingReasonText("kick", undefined)).toBeNull();
    expect(missingReasonText("purge", undefined)).toBeNull();
  });

  it("asks Discord to require the reason on those three commands", async () => {
    // The test discord.js builders are stubs, so the definitions are read from the source.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../commands.ts", import.meta.url), "utf8");
    const definition = (name: string) => source.slice(source.indexOf(`setName("${name}")`), source.indexOf("new SlashCommandBuilder()", source.indexOf(`setName("${name}")`)));
    for (const name of ["warn", "mute", "ban"]) expect(definition(name)).toMatch(/setName\("reason"\)[^\n]*setRequired\(true\)/);
    expect(definition("kick")).not.toMatch(/setName\("reason"\)[^\n]*setRequired\(true\)/);
  });
});
