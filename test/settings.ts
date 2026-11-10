import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StubSettings } from "../src/settings.js";

const MANIFEST = JSON.parse(readFileSync(join(import.meta.dirname, "..", "plugin.json"), "utf8")) as { config: { defaults: Record<string, unknown> } };

/** The defaults `plugin.json` declares, under the keys the host's configuration answers them by. */
export const MANIFEST_DEFAULTS: Record<string, unknown> = MANIFEST.config.defaults;

export const DEFAULT_SETTINGS: StubSettings = {
  accountSelectionStrategy: "hybrid",
  logging: true,
  responseText: "Hello from provider-stub: the provider pipeline works end to end.",
  modelCount: 3,
  latencyMilliseconds: 0,
  failRate: 0,
  streaming: null,
};
