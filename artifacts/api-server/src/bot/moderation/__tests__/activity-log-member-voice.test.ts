import { describe, expect, it } from "vitest";
import { buildActivityLogPresentation, memberFieldValue } from "../activity-log-presentation";
import { voiceStateChangeText } from "../events";

describe("the member in the activity log", () => {
  it("can be opened: a mention, the names and a profile link with the ID", () => {
    const value = memberFieldValue("123456789012345678", { memberDisplayName: "AX0", memberUsername: "ax0_fake" });
    expect(value).toBe("<@123456789012345678>\nAX0 · @ax0_fake\n[Deschide profilul](https://discord.com/users/123456789012345678) · ID `123456789012345678`");
    expect(memberFieldValue("x", {})).toBe("Necunoscut");
  });

  it("uses it in the leave message", () => {
    const presentation = buildActivityLogPresentation("discord.member_leave", "member", "123456789012345678", { memberDisplayName: "AX0" }, "<@1>", null);
    expect(presentation.fields.find((field) => field.name === "Membru")?.value).toContain("https://discord.com/users/123456789012345678");
  });
});

describe("the voice log", () => {
  it("says in words what changed, and nothing when nothing worth logging changed", () => {
    expect(voiceStateChangeText({ selfMute: false }, { selfMute: true })).toBe("🎙️ și-a oprit microfonul");
    expect(voiceStateChangeText({ serverMute: true, streaming: false }, { serverMute: false, streaming: true })).toBe("🔊 i s-a scos mute-ul dat de staff\n📺 a pornit transmisia live");
    expect(voiceStateChangeText({ selfMute: true }, { selfMute: true })).toBeNull();
  });

  it("shows the change without raw fields", () => {
    const presentation = buildActivityLogPresentation("discord.voice_state_update", "member", "123456789012345678",
      { voiceChange: "🎙️ și-a oprit microfonul", channelName: "#General", memberDisplayName: "Ana" }, "<@1>", null);
    const text = presentation.fields.map((field) => `${field.name}: ${field.value}`).join("\n");
    expect(text).toContain("Ce s-a schimbat:** 🎙️ și-a oprit microfonul");
    expect(text).not.toMatch(/SelfMute|ChannelChanged|Streaming/);
  });
});
