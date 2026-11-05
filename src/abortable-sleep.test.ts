import { describe, expect, it } from "vitest";
import { abortableSleep } from "./abortable-sleep.js";

describe("abortableSleep", () => {
  it("resolves after the wait", async () => {
    await expect(abortableSleep(5, new AbortController().signal)).resolves.toBeUndefined();
  });

  it("rejects at once when the signal aborts during the wait", async () => {
    const controller = new AbortController();
    const waiting = abortableSleep(60000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow(/abort/i);
  });

  it("rejects without waiting when the signal is already aborted", async () => {
    await expect(abortableSleep(60000, AbortSignal.abort())).rejects.toThrow(/abort/i);
  });
});
