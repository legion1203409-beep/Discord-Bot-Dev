export const AUTH_REQUEST_TIMEOUT_MS = 15_000;
export const AUTH_REQUEST_TIMEOUT_MESSAGE = "Verificarea autentificării a durat prea mult. Reîncearcă.";

/** Bound read-only authentication checks, including a stalled response body. */
export async function withAuthRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(AUTH_REQUEST_TIMEOUT_MESSAGE));
        controller.abort();
      }, timeoutMs);
    });
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}