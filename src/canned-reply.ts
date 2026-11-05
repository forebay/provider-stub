import type { IrResponse, IrUsage } from "@forebay/host";

export const CANNED_MESSAGE_ID = "msg_stub_0001";
export const CANNED_USAGE: IrUsage = { inputTokens: 1, outputTokens: 12 };

export const BLANK_RESPONSE_TEXT = "stub response";

export function servedText(model: string, responseText: string): string {
  const text = responseText.trim() === "" ? BLANK_RESPONSE_TEXT : responseText;
  return `${text} (served by ${model})`;
}

export function cannedResponse(model: string, responseText: string): IrResponse {
  return {
    id: CANNED_MESSAGE_ID,
    model,
    content: [{ kind: "text", text: servedText(model, responseText) }],
    stopReason: "end_turn",
    usage: CANNED_USAGE,
  };
}
