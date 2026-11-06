import { describe, expect, it } from "vitest";
import { buildActivityLogPresentation } from "../activity-log-presentation";
import { permissionOverwriteChanges } from "../events";

const overwrites = (entries: Array<[string, number, bigint, bigint]>) => ({
  permissionOverwrites: { cache: new Map(entries.map(([id, type, allow, deny]) => [id, { id, type, allow: { bitfield: allow }, deny: { bitfield: deny } }])) },
});

describe("a channel update in the activity log", () => {
  it("does not show internal fields or an empty list of changes", () => {
    const detail = { excludedByPolicy: false, changedFields: [], entityName: "🛠️・ADMINISTRAȚIE", channelId: "123456789", changes: {} };
    const presentation = buildActivityLogPresentation("discord.channelUpdate", "channel", "123456789", detail, "Neverificat de Discord", "<#123456789>");
    const text = presentation.fields.map((field) => `${field.name}: ${field.value}`).join("\n");
    expect(text).not.toMatch(/ExcludedByPolicy|ChangedFields|Element:|Modificări:\*\*\s*$/m);
    expect(presentation.fields.find((field) => field.name === "Detalii")?.value).toMatch(/Discord nu a spus exact/);
  });

  it("names what changed: the permissions and the position", () => {
    const detail = {
      excludedByPolicy: false, changedFields: ["permissions", "position"], entityName: "x", channelId: "123456789",
      changes: { permissions: "schimbate pentru <@&555555555>", position: { from: 3, to: 5 } },
    };
    const value = buildActivityLogPresentation("discord.channelUpdate", "channel", "123456789", detail, "<@1>", "<#123456789>")
      .fields.find((field) => field.name === "Detalii")?.value;
    expect(value).toContain("**Permisiuni:** schimbate pentru <@&555555555>");
    expect(value).toContain("**Poziție:** 3 → 5");
  });

  it("finds whose permissions changed, were added or removed", () => {
    const before = overwrites([["1", 0, 1n, 0n], ["2", 1, 0n, 0n], ["3", 0, 0n, 8n]]);
    const after = overwrites([["1", 0, 3n, 0n], ["2", 1, 0n, 0n], ["4", 1, 1n, 0n]]);
    expect(permissionOverwriteChanges(before, after)).toEqual({ added: ["<@4>"], removed: ["<@&3>"], changed: ["<@&1>"] });
    expect(permissionOverwriteChanges(before, before)).toBeNull();
    expect(permissionOverwriteChanges({}, after)).toBeNull();
  });
});
