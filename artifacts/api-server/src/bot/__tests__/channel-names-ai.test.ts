import { describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));

import { suggestChannelNames } from "../channel-names";

describe("propunerile AI pentru numele canalelor", () => {
  it("păstrează doar canalele cunoscute, cu nume curățate, și trimite tema și catalogul", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ names: {
      "activityLog.messages": "📜・Cronica Scrisorilor", "category.gameplay": "⚔️・ARENA REGATULUI", "inventat": "x", "main": "@everyone",
    } }) } }] });
    const names = await suggestChannelNames("regat medieval, cenușă și foc");
    expect(names).toEqual({ "activityLog.messages": "📜・cronica-scrisorilor", "category.gameplay": "⚔️・ARENA REGATULUI", main: "everyone" });
    const request = create.mock.calls[0]![0];
    expect(request.response_format).toEqual({ type: "json_object" });
    const user = JSON.parse(request.messages[1].content);
    expect(user.tema).toBe("regat medieval, cenușă și foc");
    expect(user.canale.some((entry: { key: string }) => entry.key === "activityLog.messages")).toBe(true);
  });
  it("un răspuns stricat sau gol devine o eroare clară", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValueOnce({ choices: [{ message: { content: "nu e json" } }] });
    await expect(suggestChannelNames("spațiu")).rejects.toThrow("AI-ul nu a răspuns acum");
    create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ names: {} }) } }] });
    await expect(suggestChannelNames("spațiu")).rejects.toThrow("n-a propus niciun nume");
  });
});
