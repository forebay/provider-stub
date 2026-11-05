import type { ModelsAnswer } from "@forebay/host";

const DEFAULT_MODEL_ID = "stub-model";
const NAMED_MODELS = [
  { id: DEFAULT_MODEL_ID, name: "Stub Default" },
  { id: "stub-pro", name: "Stub Pro" },
  { id: "stub-fast", name: "Stub Fast" },
];
const CONTEXT_WINDOW = 200000;
const OUTPUT_LIMIT = 64000;

function modelAt(index: number): { id: string; name: string } {
  return NAMED_MODELS[index] ?? { id: `stub-${index + 1}`, name: `Stub ${index + 1}` };
}

/** The first `count` stub models, never fewer than one. */
export function stubModels(count: number): ModelsAnswer {
  const models = Array.from({ length: Math.max(1, count) }, (_, index) => ({ ...modelAt(index), context: CONTEXT_WINDOW, output: OUTPUT_LIMIT }));
  return { models, defaultModelId: DEFAULT_MODEL_ID };
}

export { DEFAULT_MODEL_ID };
