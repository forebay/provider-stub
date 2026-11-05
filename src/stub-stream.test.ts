import { describe, expect, it } from "vitest";
import { contractProblems } from "../test/contract-answers.js";
import { stubEvents } from "./stub-stream.js";

describe("stubEvents", () => {
  it("emits the six events of a text reply in order, the text served by the model in the one delta", () => {
    const events = stubEvents("stub-model", "yo");
    expect(events.map((event) => event.event)).toEqual([
      "message_start",
      "content_block_start",
      "text_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    expect(events[2]).toMatchObject({ index: 0, text: "yo (served by stub-model)" });
  });

  it("opens with the canned message id, model and one input token, and closes the message as end_turn with twelve output tokens", () => {
    const events = stubEvents("stub-pro", "x");
    expect(events[0]).toMatchObject({ id: "msg_stub_0001", model: "stub-pro", role: "assistant", usage: { inputTokens: 1, outputTokens: 0 } });
    expect(events[4]).toMatchObject({ stopReason: "end_turn", usage: { outputTokens: 12 } });
  });

  it("conforms to the provider contract", () => {
    expect(contractProblems("HandleIrAnswer", stubEvents("stub-model", "yo"))).toEqual([]);
  });
});
