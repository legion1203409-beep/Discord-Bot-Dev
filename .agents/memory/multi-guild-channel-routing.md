---
name: Multi-guild channel routing
description: Legacy fallback, explicit destination clearing, and the fetchChannel() pattern for scheduler isolation.
---

## Rule
`getChannel(type, guildId)` returns `string | null`. Non-original guilds without `/setcanale` config get `null`. Scheduler MUST use `fetchChannel()` helper, which logs a warning and returns `null`. Every channel-dependent action must guard for a truthy ID and skip gracefully on null or empty.

An omitted setting is different from an explicitly saved empty string: omitted values may use the original guild's legacy defaults or the `council`/`fratia` inheritance from `main`; an explicit `""` disables the destination and must survive UI/API serialization. `getChannel()` returns that explicit empty string so truthy guards skip it and `??` fallbacks cannot silently restore another route.

**Why:** Without preserving the explicit clear, blank form values were omitted at save time and legacy destinations reactivated. A nullish fallback also reactivated `main` for an explicitly cleared `fratia`.

## How to apply
- Preserve the difference between omitted and empty destination values in forms, schemas, persistence, and fallback logic.
- `channel-config.ts` — `getChannel()` returns `string | null`; explicit empty settings return `""`.
- `scheduler.ts` — `fetchChannel(client, type, guildId)` wraps empty/null check + Discord fetch + TextChannel instanceof check. Use `channel.id` for channelId fields in boss/chest state objects (don't re-call getChannel after fetch).
- `index.ts` — inline guard: `const id = getChannel(...); const ch = id ? await client.channels.fetch(id).catch(() => null) : null;`
- `startOracle(client, id)` — guard: `const id = getChannel("main", guildId); if (id) startOracle(client, id);`
- Automated destinations must also reject channels whose parent is one of the Oracle ticket categories; tickets are conversation-only and must never receive chests, events, bosses, or trader posts.

## Test pattern
Any Vitest test file that imports scheduler functions **must** mock `channel-config`:
```typescript
vi.mock("../channel-config", () => ({
  getChannel:        vi.fn(() => "mock-channel-id"),
  initChannelConfig: vi.fn(),
  getAllChannels:     vi.fn(() => ({})),
  setChannel:        vi.fn(),
  resetChannel:      vi.fn(),
  resetAllChannels:  vi.fn(),
}));
```
Without this mock, `getChannel` returns `null` for non-original test guild IDs, causing all scheduler channel actions to silently skip (no Discord calls, no channel.send), which breaks assertions expecting those calls.
