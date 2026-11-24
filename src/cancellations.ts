import type { Token } from "./contract.js";

/**
 * The calls running now, by the token each handle argument carried, so `cancel` can end the one it names.
 *
 * @implNote Every token is read as a bigint: the binding hands a uint64 as a number when it fits one exactly and as a
 * bigint beyond, so the same token may arrive in either form.
 */
export class Cancellations {
  readonly #running = new Map<bigint, AbortController>();

  /** Registers the call `token` names and answers the controller its cancellation aborts. */
  begin(token: Token): AbortController {
    const controller = new AbortController();
    this.#running.set(BigInt(token), controller);
    return controller;
  }

  /** Forgets the call, once it answered, unless a later call with the same token registered since. */
  end(token: Token, controller: AbortController): void {
    const key = BigInt(token);
    if (this.#running.get(key) === controller) this.#running.delete(key);
  }

  /** Ends the call `token` names; a token no running call carries does nothing. */
  cancel(token: Token): void {
    this.#running.get(BigInt(token))?.abort(new Error("the call was cancelled"));
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
