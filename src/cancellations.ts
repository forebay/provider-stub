/** The calls running now, by the token each handle argument carried, so `cancel` can end the one it names. */
export class Cancellations {
  readonly #running = new Map<bigint, AbortController>();

  /** Registers the call `token` names and answers the signal its cancellation aborts. */
  begin(token: bigint): AbortSignal {
    const controller = new AbortController();
    this.#running.set(token, controller);
    return controller.signal;
  }

  /** Forgets the call, once it answered. */
  end(token: bigint): void {
    this.#running.delete(token);
  }

  /** Ends the call `token` names; a token no running call carries does nothing. */
  cancel(token: bigint): void {
    this.#running.get(token)?.abort();
  }
}

/** Waits `milliseconds`, answering false at once if `signal` aborts first, and true once the wait ran out. */
export function waitedUnlessCancelled(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, milliseconds);
    function onAbort(): void {
      clearTimeout(timer);
      resolve(false);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
