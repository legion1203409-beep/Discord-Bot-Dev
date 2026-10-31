import { describe, expect, it } from "vitest";
import { zodResolver } from "@hookform/resolvers/zod";
import { actionSchema, autoModFormSchema, protectionFormSchema } from "./moderation-form-schemas";

const options = {
  fields: {},
  shouldUseNativeValidation: false,
  criteriaMode: "all" as const,
};

describe("moderation forms with the installed Zod resolver", () => {
  it("returns Protection field errors instead of rejecting on Zod 4 issues", async () => {
    const result = await zodResolver(protectionFormSchema)(
      { protectionEnabled: "yes" as never }, undefined, options,
    );
    expect(result.values).toEqual({});
    expect(result.errors.protectionEnabled?.message).toBeTruthy();
    expect(result.errors.protectionEnabled?.type).toBe("invalid_type");
  });

  const rule = { enabled: false, action: "none" as const, deleteMessage: false, severity: "normal" as const };
  const autoMod = {
    enabled: false, wordFilter: rule, linkBlock: rule, forbiddenWords: "",
    aiEnabled: false, aiAction: "none" as const, aiDeleteMessage: false, aiSensitivity: "medium" as const,
  };

  it("returns nested AutoMod rule errors and AI field errors", async () => {
    const result = await zodResolver(autoModFormSchema)({
      ...autoMod,
      wordFilter: { ...rule, action: "invalid" as never },
      aiSensitivity: "invalid" as never,
    }, undefined, options);
    expect(result.values).toEqual({});
    expect(result.errors.wordFilter?.action?.message).toBeTruthy();
    expect(result.errors.aiSensitivity?.message).toBeTruthy();
  });

  it("accepts valid Protection and AutoMod forms", async () => {
    expect((await zodResolver(protectionFormSchema)({ protectionEnabled: false }, undefined, options)).errors).toEqual({});
    const result = await zodResolver(autoModFormSchema)(autoMod, undefined, options);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual(autoMod);
  });

  it("returns the manual command's target error without throwing", async () => {
    const result = await zodResolver(actionSchema)({ type: "warn", targetId: "", reason: "" }, undefined, options);
    expect(result.values).toEqual({});
    expect(result.errors.targetId?.message).toBe("ID-ul țintei este necesar");
  });

  it("returns manual command length and numeric errors", async () => {
    const result = await zodResolver(actionSchema)({
      type: "mute", targetId: "555555555", durationMinutes: "invalid", reason: "x".repeat(501),
    }, undefined, options);
    expect(result.errors.durationMinutes?.message).toBeTruthy();
    expect(result.errors.reason?.message).toBeTruthy();
  });

  it("keeps manual command coercion and blank optional fields on successful submission", async () => {
    const result = await zodResolver(actionSchema)({
      type: "mute", targetId: " 555555555 ", durationMinutes: "60", reason: " ", amount: null,
    }, undefined, options);
    expect(result.errors).toEqual({});
    expect(result.values).toMatchObject({ type: "mute", targetId: "555555555", durationMinutes: 60, allMembers: false });
    expect(result.values).toHaveProperty("reason", undefined);
    expect(result.values).toHaveProperty("amount", undefined);
  });
});
