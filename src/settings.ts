import type { AccountsEnums, Config } from "./contract.js";

/** What this plugin's configuration says the stub should do, under names that read as code. */
export interface StubSettings {
  /** A forebay_accounts_strategy. */
  readonly strategy: number;
  readonly responseText: string;
  readonly modelCount: number;
  readonly latencyMilliseconds: number;
  readonly failRate: number;
  /** Null honours the request's own stream flag; true or false forces one. */
  readonly streaming: boolean | null;
}


async function settingOf(config: Config, key: string): Promise<unknown> {
  const answer = await config.get_tree({ key });
  return typeof answer === "symbol" ? undefined : answer;
}

async function text(config: Config, key: string): Promise<string> {
  const value = await settingOf(config, key);
  if (typeof value !== "string") throw new Error(`the ${key} setting of provider-stub must be a text`);
  return value;
}

/** The strategies by the names the setting takes. */
function strategiesOf(strategy: AccountsEnums["forebay_accounts_strategy"]): Readonly<Record<string, number>> {
  return { sticky: strategy.FOREBAY_ACCOUNTS_STICKY, "round-robin": strategy.FOREBAY_ACCOUNTS_ROUND_ROBIN, hybrid: strategy.FOREBAY_ACCOUNTS_HYBRID };
}

async function strategyOf(config: Config, strategies: Readonly<Record<string, number>>): Promise<number> {
  const name = await text(config, "account_selection_strategy");
  const strategy = strategies[name];
  if (strategy === undefined) throw new Error(`the account_selection_strategy setting of provider-stub must be one of ${Object.keys(strategies).join(", ")}, not ${name}`);
  return strategy;
}

async function number(config: Config, key: string): Promise<number> {
  const value = await settingOf(config, key);
  if (typeof value !== "number") throw new Error(`the ${key} setting of provider-stub must be a number`);
  return value;
}

/** Reads every setting afresh, so a change made while the host runs applies to the next request. */
export async function readSettings(config: Config, enums: AccountsEnums): Promise<StubSettings> {
  const strategy = await strategyOf(config, strategiesOf(enums.forebay_accounts_strategy));
  const streaming = await settingOf(config, "streaming");
  return {
    strategy,
    responseText: await text(config, "response_text"),
    modelCount: await number(config, "model_count"),
    latencyMilliseconds: await number(config, "latency_ms"),
    failRate: await number(config, "fail_rate"),
    streaming: typeof streaming === "boolean" ? streaming : null,
  };
}
