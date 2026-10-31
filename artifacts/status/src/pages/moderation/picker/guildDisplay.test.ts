import { describe, expect, it } from "vitest";
import { guildIconUrl, guildInitials, guildTone, isOfficialGuild, orderGuilds } from "./guildDisplay";

const guild = (id: string, name = id, icon: string | null = null) => ({ id, name, icon });

describe("guildIconUrl", () => {
  it("nu are pictogramă când Discord nu trimite una", () => {
    expect(guildIconUrl(guild("111"))).toBeNull();
  });

  it("lasă un URL întreg așa cum este", () => {
    expect(guildIconUrl(guild("111", "x", "https://cdn.example.com/a.png"))).toBe("https://cdn.example.com/a.png");
    expect(guildIconUrl(guild("111", "x", "HTTP://cdn.example.com/a.png"))).toBe("HTTP://cdn.example.com/a.png");
  });

  it("transformă un cod Discord în adresa din CDN", () => {
    expect(guildIconUrl(guild("123456789", "x", "abcdef"))).toBe("https://cdn.discordapp.com/icons/123456789/abcdef.png?size=128");
  });
});

describe("guildInitials", () => {
  it("ia prima literă din primele două cuvinte", () => {
    expect(guildInitials("Cenușa Nordului")).toBe("CN");
    expect(guildInitials("Beyond All Reason | Romania")).toBe("BA");
    expect(guildInitials("Server-ul lui LEGION")).toBe("SL");
  });

  it("un singur cuvânt dă o singură inițială", () => {
    expect(guildInitials("Canale..")).toBe("C");
  });

  it("scrie literele cu majuscule, inclusiv cele românești", () => {
    expect(guildInitials("șoimii țării")).toBe("ȘȚ");
  });

  it("sare peste semne și emoji și ține cifrele", () => {
    expect(guildInitials("🔥 Foc de tabără")).toBe("FD");
    expect(guildInitials("  ~ 2026 Clan ")).toBe("2C");
  });

  it("nu are nevoie de litere ca să arate ceva", () => {
    expect(guildInitials("🔥🔥")).toBe("🔥");
    expect(guildInitials("!!!")).toBe("!");
    expect(guildInitials("   ")).toBe("?");
    expect(guildInitials("")).toBe("?");
  });

  it("nu trece de două caractere", () => {
    expect(guildInitials("ßa ßb ßc").length).toBeLessThanOrEqual(2);
  });
});

describe("guildTone", () => {
  it("e mereu aceeași pentru același server", () => {
    expect(guildTone("987654321098765432")).toBe(guildTone("987654321098765432"));
  });

  it("alege doar dintre culorile din design", () => {
    for (const id of ["1", "22", "333", "4444", "123456789012345678", "999999999999999999"]) {
      expect(["g", "r", "n"]).toContain(guildTone(id));
    }
  });

  it("nu dă aceeași culoare tuturor", () => {
    const tones = new Set(Array.from({ length: 30 }, (_, i) => guildTone(`1${String(i * 7919).padStart(17, "0")}`)));
    expect(tones.size).toBeGreaterThan(1);
  });
});

describe("isOfficialGuild", () => {
  it("recunoaște serverul oficial după ID", () => {
    expect(isOfficialGuild(guild("111"), "111")).toBe(true);
    expect(isOfficialGuild(guild("222"), "111")).toBe(false);
  });

  it("fără ID oficial, niciun server nu e oficial", () => {
    expect(isOfficialGuild(guild("111"), null)).toBe(false);
    expect(isOfficialGuild(guild("111"), undefined)).toBe(false);
    expect(isOfficialGuild(guild(""), "")).toBe(false);
  });
});

describe("orderGuilds", () => {
  const list = [guild("1"), guild("2"), guild("3"), guild("4")];

  it("pune serverul oficial primul și păstrează ordinea celorlalte", () => {
    expect(orderGuilds(list, "3").map((g) => g.id)).toEqual(["3", "1", "2", "4"]);
  });

  it("nu schimbă nimic fără server oficial sau când oficialul nu e în listă", () => {
    expect(orderGuilds(list, null)).toBe(list);
    expect(orderGuilds(list, "9")).toBe(list);
  });

  it("nu modifică lista primită", () => {
    const copy = [...list];
    orderGuilds(list, "4");
    expect(list).toEqual(copy);
  });
});
