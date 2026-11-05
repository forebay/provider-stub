import type { PluginConfig } from "@weivel/typescript";

/** What this plugin's configuration says the stub should do, under names that read as code. */
export interface StubSettings {
  accountSelectionStrategy: string;
  logging: boolean;
  responseText: string;
  modelCount: number;
  latencyMilliseconds: number;
  failRate: number;
  /** Null honours the request's own stream flag; true or false forces one. */
  streaming: boolean | null;
}

function required<T>(config: PluginConfig, key: string, type: "string" | "number" | "boolean"): T {
  const value = config.get<unknown>(key);
  if (value === undefined) throw new Error(`the ${key} setting is missing from stub-auth's configuration`);
  if (typeof value !== type) throw new Error(`the ${key} setting of stub-auth must be a ${type}`);
  return value as T;
}

function streamingOverride(config: PluginConfig): boolean | null {
  const value = config.get<unknown>("streaming");
  return typeof value === "boolean" ? value : null;
}

/** Reads every setting afresh, so a change made while the host runs applies to the next request. */
export function readSettings(config: PluginConfig): StubSettings {
  return {
    accountSelectionStrategy: required(config, "account_selection_strategy", "string"),
    logging: required(config, "logging", "boolean"),
    responseText: required(config, "response_text", "string"),
    modelCount: required(config, "model_count", "number"),
    latencyMilliseconds: required(config, "latency_ms", "number"),
    failRate: required(config, "fail_rate", "number"),
    streaming: streamingOverride(config),
  };
}
