import { join } from "node:path";
import type { AccountsService, Provider } from "@forebay/host";
import type { Plugin, PluginContext } from "@weivel/typescript";
import { abortableSleep } from "./abortable-sleep.js";
import { createHandleIr } from "./handle-ir.js";
import { createLoginAction, listAccountsAction } from "./login-action.js";
import { stubModels } from "./models.js";
import { readSettings } from "./settings.js";

const ACCOUNTS_STORE_FILE = "accounts.json";
const ACTIONS_SERVICE = "stub-auth:accounts";

function accountsOf(context: PluginContext): () => AccountsService {
  return () => {
    const accounts = context.services.get(context.service<AccountsService>("accounts"));
    if (accounts === undefined) throw new Error("this host offers no accounts service, so stub-auth cannot pick an account");
    return accounts;
  };
}

function providerOf(context: PluginContext, accounts: () => AccountsService, store: string): Provider {
  const settings = () => readSettings(context.config);
  const handleIr = createHandleIr({
    accounts,
    store,
    settings,
    clock: Date.now,
    random: Math.random,
    sleep: abortableSleep,
    log: (message) => context.log.warn(message),
  });
  return { models: () => stubModels(settings().modelCount), handleIr };
}

const plugin: Plugin = {
  activate(context) {
    const accounts = accountsOf(context);
    const store = join(context.paths.plugin, ACCOUNTS_STORE_FILE);
    context.provide(context.capability<Provider>("provider"), providerOf(context, accounts, store));
    context.services.register(context.service(ACTIONS_SERVICE), {
      login: createLoginAction({ accounts, store, secrets: context.secrets, clock: Date.now }),
      list: listAccountsAction({ accounts, store }),
    });
  },
  deactivate() {},
};

export default plugin;
