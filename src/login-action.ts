import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AccountsService } from "@forebay/host";
import type { PluginSecrets } from "@weivel/typescript";

/** The accounts service and store every action works on. */
export interface AccountActionDependencies {
  accounts: () => AccountsService;
  store: string;
}

export interface LoginDependencies extends AccountActionDependencies {
  secrets: PluginSecrets | undefined;
  clock: () => number;
}

function accountIdOf(number: number): string {
  return `stub-${number}@example.com`;
}

function nextAccountId(existingIds: string[]): string {
  let number = existingIds.length + 1;
  while (existingIds.includes(accountIdOf(number))) number++;
  return accountIdOf(number);
}

function existingIds(dependencies: AccountActionDependencies): string[] {
  return (dependencies.accounts().list({ store: dependencies.store }).accounts ?? []).map((account) => account.id);
}

/** The `login` action: adds the next demo account and keeps its token in the plugin's secrets, never in the store. */
export function createLoginAction(dependencies: LoginDependencies): () => Promise<{ added: string }> {
  return async () => {
    const { secrets } = dependencies;
    if (secrets === undefined) throw new Error("this host has no secret store, which stub-auth keeps its account tokens in");
    const id = nextAccountId(existingIds(dependencies));
    mkdirSync(dirname(dependencies.store), { recursive: true });
    dependencies.accounts().upsert({ store: dependencies.store, account: { id, email: id, label: id, enabled: true, addedAt: dependencies.clock() } });
    await secrets.set(`account.${id}.access`, `stub-access-${id}`);
    return { added: id };
  };
}

/** The `accounts` action: the demo accounts and whether each is enabled. */
export function listAccountsAction(dependencies: AccountActionDependencies): () => { accounts: Array<{ id: string; enabled: boolean }> } {
  return () => ({
    accounts: (dependencies.accounts().list({ store: dependencies.store }).accounts ?? []).map((account) => ({ id: account.id, enabled: account.enabled !== false })),
  });
}
