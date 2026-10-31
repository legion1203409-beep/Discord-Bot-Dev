import { describe, expect, it } from "vitest";
import original from "../../../../../attached_assets/panoul-oracolului_1792758552669.html?raw";
import { buildSourcePanelDocument, SOURCE_VIEWS } from "./source-panel-document";

function build(name = "Server autentic") {
  return buildSourcePanelDocument({
    channel: "test-channel", nonce: "test-nonce", origin: "https://example.test",
    guildId: "123456789", view: "acasa",
    servers: [{ id: "123456789", name, ini: "SA", icon: null, c1: "#123456", c2: "#654321" }],
  });
}
describe("faithful original document integration", () => {
  it("keeps every original view and its complete field definitions, not an inventory", () => {
    const html = build();
    for (const view of SOURCE_VIEWS) expect(html).toContain(`id="v-${view}"`);
    const schema = (text: string) => text.slice(text.indexOf("const F = {}"), text.indexOf("const MOD ="));
    expect(schema(html)).toBe(schema(original).replace("F.text('emoji', 'Emoji pe buton', '✅',", "F.text('emoji', 'Emoji pe buton', '',"));
    expect(html).toContain('id="eyeBig"');
    expect(html).toContain('id="toolList"');
    expect(html).toContain('id="palQ"');
    expect(html).toContain("function fieldHTML(");
  });
  it("produces executable bridge and original runtime scripts", () => {
    const scripts = [...build().matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(2);
    for (const [, script] of scripts) expect(() => new Function(script!)).not.toThrow();
  });
  it("removes operational browser storage and the external demo database", () => {
    const html = build();
    expect(html).not.toContain("function writeLocal(");
    expect(html).not.toContain("function readLocal(");
    expect(html).not.toContain("DB.collection(");
    expect(html).toContain("window.__OC.rpc('save'");
    expect(html).toContain("window.__OC.rpc('load'");
  });
  it("escapes server text at the script boundary", () => {
    const html = build("</script><script>window.injected=true</script>");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(2);
    expect(html).not.toContain("<script>window.injected=true");
  });
});
