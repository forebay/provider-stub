import { describe, expect, it } from "vitest";
import type { PluginConfig } from "@weivel/typescript";
import { DEFAULT_SETTINGS, MANIFEST_DEFAULTS } from "../test/settings.js";
import { readSettings } from "./settings.js";

function configOf(values: Record<string, unknown>): PluginConfig {
  return { get: (key: string) => values[key], all: () => values } as unknown as PluginConfig;
}

describe("readSettings", () => {
  it("reads the seven manifest defaults as the stub always had them", () => {
    expect(readSettings(configOf(MANIFEST_DEFAULTS))).toEqual(DEFAULT_SETTINGS);
  });

  it("follows the configuration as it changes, because it is read on every call", () => {
    const values: Record<string, unknown> = { ...MANIFEST_DEFAULTS };
    const config = configOf(values);
    values.response_text = "changed";
    values.model_count = 5;
    expect(readSettings(config)).toMatchObject({ responseText: "changed", modelCount: 5 });
  });

  it("reads the streaming override as forced on, forced off or absent", () => {
    expect(readSettings(configOf({ ...MANIFEST_DEFAULTS, streaming: true })).streaming).toBe(true);
    expect(readSettings(configOf({ ...MANIFEST_DEFAULTS, streaming: false })).streaming).toBe(false);
    expect(readSettings(configOf({ ...MANIFEST_DEFAULTS, streaming: null })).streaming).toBeNull();
    expect(readSettings(configOf({ ...MANIFEST_DEFAULTS, streaming: "maybe" })).streaming).toBeNull();
  });

  it("names the setting that is missing instead of inventing a value", () => {
    const { response_text: _omitted, ...rest } = MANIFEST_DEFAULTS;
    expect(() => readSettings(configOf(rest))).toThrow(/response_text/);
  });

  it("refuses a setting of the wrong type, naming it", () => {
    expect(() => readSettings(configOf({ ...MANIFEST_DEFAULTS, fail_rate: "often" }))).toThrow(/fail_rate/);
  });
});
