import type { CatalogModel, CatalogProvider } from "./contract.js";

export const PROVIDER_NAME = "provider-stub";
export const DEFAULT_MODEL_ID = "stub-model";

const NAMED_MODELS = [
  { id: DEFAULT_MODEL_ID, name: "Stub Default" },
  { id: "stub-pro", name: "Stub Pro" },
  { id: "stub-fast", name: "Stub Fast" },
];
const CONTEXT_WINDOW = 200000;
const OUTPUT_LIMIT = 64000;

function modelAt(index: number): CatalogModel {
  const named = NAMED_MODELS[index] ?? { id: `stub-${index + 1}`, name: `Stub ${index + 1}` };
  return { ...named, has_context: 1, context: CONTEXT_WINDOW, has_output: 1, output: OUTPUT_LIMIT };
}

/** The stub's catalog entry: the first `count` stub models, never fewer than one, or none while no account can serve. */
export function stubCatalog(count: number, serving: boolean): CatalogProvider {
  const models = serving ? Array.from({ length: Math.max(1, count) }, (_, index) => modelAt(index)) : [];
  return { provider: PROVIDER_NAME, models, has_ranking: 0, default_model: DEFAULT_MODEL_ID };
}
