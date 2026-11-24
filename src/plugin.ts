import { join } from "node:path";
import type { DescribedEnums, PluginContext } from "@weivel/typescript/context";
import type { Plugin } from "@weivel/typescript/host";
import { accountActions } from "./account-actions.js";
import type { Accounts, Anthropic, Config, Enums, Log, Paths, Provider } from "./contract.js";
import { stubProvider } from "./provider.js";

const PROVIDER_CAPABILITY = "forebay.provider";
const ACTIONS_SERVICE = "provider-stub:accounts";
const ACCOUNTS_STORE_FILE = "accounts.json";

function required<Service>(context: PluginContext, id: string): Service {
  const service = context.services.get(context.service<Service>(id));
  if (service === undefined) throw new Error(`provider-stub reaches no ${id} service`);
  return service;
}

/** The enums a description carries, read as the names this plugin reads of them. */
function described<Read>(enums: DescribedEnums | undefined, of: string): Read {
  if (enums === undefined) throw new Error(`provider-stub reads the enums of ${of}, and no description carries them`);
  return enums as unknown as Read;
}

const plugin: Plugin = {
  async activate(context) {
    const accounts = required<Accounts>(context, "accounts");
    const anthropic = required<Anthropic>(context, "anthropic");
    const log = required<Log>(context, "weivel.log");
    const providerType = context.capability<Provider>(PROVIDER_CAPABILITY);
    const enums: Enums = {
      provider: described(context.capabilities.enumsOf(providerType), PROVIDER_CAPABILITY),
      anthropic: described(context.services.enumsOf(anthropic), "anthropic"),
      accounts: described(context.services.enumsOf(accounts), "accounts"),
      log: described(context.services.enumsOf(log), "weivel.log"),
    };
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
