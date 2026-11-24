import type { IrEvent, IrFailure, IrResponse, IrUsage, ProviderEnums } from "./contract.js";

const CANNED_MESSAGE_ID = "msg_stub_0001";
const INPUT_TOKENS = 1;
const OUTPUT_TOKENS = 12;
const BLANK_RESPONSE_TEXT = "stub response";

function usage(outputTokens: number): IrUsage {
  return { has_input_tokens: 1, input_tokens: INPUT_TOKENS, has_output_tokens: 1, output_tokens: outputTokens };
}

function servedText(model: string, responseText: string): string {
  const text = responseText.trim() === "" ? BLANK_RESPONSE_TEXT : responseText;
  return `${text} (served by ${model})`;
}

export function cannedResponse(model: string, responseText: string, enums: ProviderEnums): IrResponse {
  return {
    id: CANNED_MESSAGE_ID,
    model,
    stop_reason: "end_turn",
    content: [{ kind: enums.forebay_ir_block_kind.FOREBAY_IR_BLOCK_TEXT, text: servedText(model, responseText) }],
    usage: usage(OUTPUT_TOKENS),
  };
}

/** The canned reply as the six events of a streamed text message. */
export function cannedEvents(model: string, responseText: string, enums: ProviderEnums): IrEvent[] {
  const event = enums.forebay_ir_event_kind;
  return [
    { kind: event.FOREBAY_IR_EVENT_MESSAGE_START, id: CANNED_MESSAGE_ID, model, role: "assistant", usage: usage(0) },
    { kind: event.FOREBAY_IR_EVENT_CONTENT_BLOCK_START, index: 0, block_kind: enums.forebay_ir_block_kind.FOREBAY_IR_BLOCK_TEXT },
    { kind: event.FOREBAY_IR_EVENT_TEXT_DELTA, index: 0, text: servedText(model, responseText) },
    { kind: event.FOREBAY_IR_EVENT_CONTENT_BLOCK_STOP, index: 0 },
    { kind: event.FOREBAY_IR_EVENT_MESSAGE_DELTA, stop_reason: "end_turn", usage: usage(OUTPUT_TOKENS) },
    { kind: event.FOREBAY_IR_EVENT_MESSAGE_STOP },
  ];
}

/** A failure in the shape of Anthropic's `overloaded_error`, as the upstream answers one. */
export function overloaded(status: number, message: string): IrFailure {
  const body = JSON.stringify({ type: "error", error: { type: "overloaded_error", message } });
  return { status, headers: [{ name: "content-type", value: "application/json" }], body };
}
