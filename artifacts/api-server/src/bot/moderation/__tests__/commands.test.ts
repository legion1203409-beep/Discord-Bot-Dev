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
