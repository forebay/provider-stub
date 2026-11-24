import { describe, expect, it } from "vitest";
import { Cancellations } from "../src/cancellations.js";

describe("Cancellations", () => {
  it("cancels the call a token names, given as a bigint or as a number", () => {
    const cancellations = new Cancellations();
    const first = cancellations.begin(1n);
    const second = cancellations.begin(2);

    cancellations.cancel(1);
    cancellations.cancel(2n);

    expect([first.signal.aborted, second.signal.aborted]).toEqual([true, true]);
  });

  it("does nothing for a token no running call carries, nor for one that answered", () => {
    const cancellations = new Cancellations();
    const answered = cancellations.begin(3n);
    cancellations.end(3n, answered);

    cancellations.cancel(3n);
    cancellations.cancel(4n);

    expect(answered.signal.aborted).toBe(false);
  });

  it("keeps a later call's registration when an earlier call with the same token ends", () => {
    const cancellations = new Cancellations();
    const earlier = cancellations.begin(5n);
    const later = cancellations.begin(5n);

    cancellations.end(5n, earlier);
    cancellations.cancel(5n);

    expect(later.signal.aborted).toBe(true);
  });
});
