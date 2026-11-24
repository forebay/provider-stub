import { join } from "node:path";
import type { PluginContext } from "@weivel/typescript/context";
import { accountActions } from "./account-actions.js";
import type { Accounts, Config, Log, Paths } from "./contract.js";
import { stubProvider } from "./provider.js";

const PROVIDER_CAPABILITY = "forebay.provider";
const ACTIONS_SERVICE = "provider-stub:accounts";
const ACCOUNTS_STORE_FILE = "accounts.json";

function required<Service>(context: PluginContext, id: string): Service {
  const service = context.services.get(context.service<Service>(id));
  if (service === undefined) throw new Error(`provider-stub reaches no ${id} service`);
  return service;
}

const plugin = {
  async activate(context: PluginContext): Promise<void> {
    const accounts = required<Accounts>(context, "accounts");
    const store = join(await required<Paths>(context, "weivel.paths").plugin({}), ACCOUNTS_STORE_FILE);
    const dependencies = {
      accounts,
      config: required<Config>(context, "weivel.config"),
      log: required<Log>(context, "weivel.log"),
      store,
      clock: Date.now,
      random: Math.random,
    };
    context.provide(context.capability(PROVIDER_CAPABILITY), stubProvider(dependencies));
    context.services.register(context.service(ACTIONS_SERVICE), accountActions(accounts, store, Date.now));
  },
  deactivate(): void {},
};

export default plugin;
