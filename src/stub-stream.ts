import type { IrStreamEvent } from "@forebay/host";
import { CANNED_MESSAGE_ID, CANNED_USAGE, servedText } from "./canned-reply.js";

/** The canned reply as the six events of a streamed text message. */
export function stubEvents(model: string, responseText: string): IrStreamEvent[] {
  return [
    { event: "message_start", id: CANNED_MESSAGE_ID, model, role: "assistant", usage: { inputTokens: CANNED_USAGE.inputTokens ?? 0, outputTokens: 0 } },
    { event: "content_block_start", index: 0, blockKind: "text" },
    { event: "text_delta", index: 0, text: servedText(model, responseText) },
    { event: "content_block_stop", index: 0 },
    { event: "message_delta", stopReason: "end_turn", usage: CANNED_USAGE },
    { event: "message_stop" },
  ];
}
