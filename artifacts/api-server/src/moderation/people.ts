import { Routes, type Client } from "discord.js";
import { logger } from "../lib/logger";

/** A member or user as the panel shows them in case and audit lists. */
export type PersonSummary = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string;
  /** Still on the server. */
  inGuild: boolean;
  bot: boolean;
};

type RestUser = { id?: string; username?: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
type RestMember = { nick?: string | null; user?: RestUser };

export const MAX_PEOPLE_PER_REQUEST = 50;
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHED = 5_000;
const LOOKUPS_AT_ONCE = 4;
// Positive and negative answers both, so a list of the same IDs does not ask Discord again for a while.
const cache = new Map<string, { at: number; person: PersonSummary | null }>();

function remember(key: string, person: PersonSummary | null): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), person });
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function avatarUrl(id: string, hash: string | null | undefined): string {
  if (hash) return `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=64`;
  let index = 0;
  try {
    index = Number((BigInt(id) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function personFromRest(id: string, user: RestUser | undefined, nick: string | null | undefined, inGuild: boolean): PersonSummary {
  const username = user?.username ?? null;
  return {
    id,
    name: nick || user?.global_name || username || id,
    username,
    avatarUrl: avatarUrl(id, user?.avatar),
    inGuild,
    bot: Boolean(user?.bot),
  };
}

function discordCode(error: unknown): number | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as { code: unknown }).code);
    return Number.isFinite(code) ? code : null;
  }
  return null;
}

async function lookUp(client: Client, guildId: string, id: string): Promise<PersonSummary | null> {
  const cached = client.guilds.cache.get(guildId)?.members.cache.get(id);
  if (cached) {
    return personFromRest(id, {
      id, username: cached.user.username, global_name: cached.user.globalName, avatar: cached.user.avatar, bot: cached.user.bot,
    }, cached.nickname, true);
  }
  try {
    // One member by REST: the gateway member request is rate limited (see the member list note).
    const member = await client.rest.get(Routes.guildMember(guildId, id)) as RestMember;
    return personFromRest(id, member.user, member.nick, true);
  } catch (error) {
    if (discordCode(error) !== 10007) throw error;
  }
  try {
    const user = await client.rest.get(Routes.user(id)) as RestUser;
    return personFromRest(id, user, null, false);
  } catch (error) {
    if (discordCode(error) === 10013) return null;
    throw error;
  }
}

/**
 * Names and pictures for the IDs a panel list shows. Unknown or unreachable IDs are
 * left out, and the list shows the ID instead.
 */
export async function resolvePeople(client: Client, guildId: string, ids: readonly string[]): Promise<PersonSummary[]> {
  const unique = [...new Set(ids)].slice(0, MAX_PEOPLE_PER_REQUEST);
  const found = new Map<string, PersonSummary>();
  const missing: string[] = [];
  const now = Date.now();
  for (const id of unique) {
    const hit = cache.get(`${guildId}:${id}`);
    if (hit && now - hit.at < TTL_MS) {
      if (hit.person) found.set(id, hit.person);
    } else {
      missing.push(id);
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const id = missing[next++]!;
      try {
        const person = await lookUp(client, guildId, id);
        remember(`${guildId}:${id}`, person);
        if (person) found.set(id, person);
      } catch (error) {
        // Not remembered: the next list asks again.
        logger.debug({ guildId, userId: id, code: discordCode(error) }, "Could not look up a member for the panel");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOOKUPS_AT_ONCE, missing.length) }, worker));
  return unique.map((id) => found.get(id)).filter((person): person is PersonSummary => Boolean(person));
}

export function clearPeopleCache(): void {
  cache.clear();
}
