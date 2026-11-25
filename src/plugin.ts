import { join } from "node:path";
import type { PluginContext } from "@weivel/typescript/context";
import type { Plugin } from "@weivel/typescript/host";
import { accountActions } from "./account-actions.js";
import { ACCOUNTS_ENUM_NAMES, ANTHROPIC_ENUM_NAMES, LOG_ENUM_NAMES, PROVIDER_ENUM_NAMES, type Accounts, type Anthropic, type Config, type Enums, type Log, type Paths, type Provider } from "./contract.js";
import { stubProvider } from "./provider.js";

const PROVIDER_CAPABILITY = "forebay.provider";
const ACTIONS_SERVICE = "provider-stub:accounts";
const ACCOUNTS_STORE_FILE = "accounts.json";

function required<Service>(context: PluginContext, id: string): Service {
  const service = context.services.get(context.service<Service>(id));
  if (service === undefined) throw new Error(`provider-stub reaches no ${id} service`);
  return service;
}

/**
 * Every enum entry this plugin reads, from the descriptions of what it reaches, refusing the activation when one lacks
 * a name it reads.
 *
 * @implNote They are read once, at the activation, which holds because a header's enums are append-only: an entry never
 * changes its number while the plugin runs.
 */
function enumsOf(context: PluginContext, reached: { accounts: Accounts; anthropic: Anthropic; log: Log }): Enums {
  const { services, capabilities } = context;
  return {
    provider: context.requireEnums(capabilities.enumsOf(context.capability(PROVIDER_CAPABILITY)), PROVIDER_ENUM_NAMES, PROVIDER_CAPABILITY),
    anthropic: context.requireEnums(services.enumsOf(reached.anthropic), ANTHROPIC_ENUM_NAMES, "anthropic"),
    accounts: context.requireEnums(services.enumsOf(reached.accounts), ACCOUNTS_ENUM_NAMES, "accounts"),
    log: context.requireEnums(services.enumsOf(reached.log), LOG_ENUM_NAMES, "weivel.log"),
  };
}

const plugin: Plugin = {
  async activate(context) {
    const accounts = required<Accounts>(context, "accounts");
    const anthropic = required<Anthropic>(context, "anthropic");
    const log = required<Log>(context, "weivel.log");
    const providerType = context.capability<Provider>(PROVIDER_CAPABILITY);
    const enums = enumsOf(context, { accounts, anthropic, log });
    const store = join(await required<Paths>(context, "weivel.paths").plugin({}), ACCOUNTS_STORE_FILE);
    const dependencies = {
      accounts,
      anthropic,
      config: required<Config>(context, "weivel.config"),
      log,
      enums,
      store,
      clock: Date.now,
      random: Math.random,
    };
    context.provide(providerType, stubProvider(dependencies));
    context.services.register(context.service(ACTIONS_SERVICE), accountActions(accounts, store, Date.now));
  },
  deactivate() {},
};

export default plugin;
