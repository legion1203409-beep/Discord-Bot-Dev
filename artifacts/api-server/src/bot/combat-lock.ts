const turnQueues = new Map<string, Promise<void>>();

export async function withCombatTurnLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = turnQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const queued = new Promise<void>((resolve) => {
    release = resolve;
  });
  turnQueues.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (turnQueues.get(key) === queued) turnQueues.delete(key);
  }
}

export function combatTurnLockKey(
  guildId: string,
  eventId: number,
  discordId: string,
): string {
  return `${guildId}:${eventId}:${discordId}`;
}
