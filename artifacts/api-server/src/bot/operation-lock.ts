const pendingOperations = new Map<string, Promise<unknown>>();

/** Serialize a resource's read/create/save cycle; failed operations never block retries. */
export async function serializeBotOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingOperations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  pendingOperations.set(key, current);
  try {
    return await current;
  } finally {
    if (pendingOperations.get(key) === current) pendingOperations.delete(key);
  }
}
