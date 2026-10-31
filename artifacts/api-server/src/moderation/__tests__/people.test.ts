import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "discord.js";
import { avatarUrl, clearPeopleCache, resolvePeople } from "../people";

const GUILD = "100000000000000001";

function client(rest: (route: string) => unknown) {
  const get = vi.fn(async (route: string) => rest(route));
  const cached = { nickname: "Ana din cache", user: { username: "ana", globalName: "Ana", avatar: null, bot: false } };
  return {
    get,
    client: {
      guilds: { cache: new Map([[GUILD, { members: { cache: new Map([["200000000000000001", cached]]) } }]]) },
      rest: { get },
    } as unknown as Client,
  };
}

const discordError = (code: number) => Object.assign(new Error(`Discord ${code}`), { code });

describe("names for the panel's lists", () => {
  beforeEach(() => clearPeopleCache());

  it("uses the member cache, then the member by REST, then the user for those who left", async () => {
    const { client: bot, get } = client((route) => {
      if (route === `/guilds/${GUILD}/members/200000000000000002`) {
        return { nick: null, user: { id: "200000000000000002", username: "bogdan", global_name: "Bogdan", avatar: "abc" } };
      }
      if (route === `/guilds/${GUILD}/members/200000000000000003`) throw discordError(10007);
      if (route === "/users/200000000000000003") return { id: "200000000000000003", username: "fost", global_name: null, avatar: null };
      if (route === `/guilds/${GUILD}/members/200000000000000004`) throw discordError(10007);
      if (route === "/users/200000000000000004") throw discordError(10013);
      throw new Error(`unexpected ${route}`);
    });
    const people = await resolvePeople(bot, GUILD, ["200000000000000001", "200000000000000002", "200000000000000003", "200000000000000004", "200000000000000002"]);
    expect(people.map((person) => [person.id, person.name, person.inGuild])).toEqual([
      ["200000000000000001", "Ana din cache", true],
      ["200000000000000002", "Bogdan", true],
      ["200000000000000003", "fost", false],
    ]);
    expect(people[1]!.avatarUrl).toBe("https://cdn.discordapp.com/avatars/200000000000000002/abc.png?size=64");
    expect(get).toHaveBeenCalledTimes(5);
    // Known and unknown answers are both remembered for a while.
    await resolvePeople(bot, GUILD, ["200000000000000002", "200000000000000004"]);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("asks again later after a failure it cannot explain", async () => {
    let fail = true;
    const { client: bot, get } = client(() => {
      if (fail) throw new Error("timeout");
      return { nick: "Ion", user: { id: "200000000000000009", username: "ion" } };
    });
    expect(await resolvePeople(bot, GUILD, ["200000000000000009"])).toEqual([]);
    fail = false;
    expect((await resolvePeople(bot, GUILD, ["200000000000000009"]))[0]?.name).toBe("Ion");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("looks up at most 50 at a time and gives everyone a picture", async () => {
    const { client: bot, get } = client(() => { throw discordError(10013); });
    const ids = Array.from({ length: 60 }, (_, index) => String(300000000000000000n + BigInt(index)));
    await resolvePeople(bot, GUILD, ids);
    expect(get.mock.calls.filter(([route]) => String(route).startsWith("/guilds/")).length).toBe(50);
    expect(avatarUrl("200000000000000002", null)).toMatch(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
    expect(avatarUrl("200000000000000002", "a_x")).toContain("/a_x.gif");
  });
});
