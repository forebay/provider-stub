import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Accounts } from "./contract.js";

/** The service `provider-stub:accounts`, whose methods the manifest's `login` and `accounts` actions call. */
export interface AccountActions {
  login(): Promise<{ added: string }>;
  list(): Promise<{ accounts: Array<{ id: string; enabled: boolean }> }>;
}

function accountIdOf(number: number): string {
  return `stub-${number}@example.com`;
}

function nextAccountId(existingIds: readonly string[]): string {
  let number = existingIds.length + 1;
  while (existingIds.includes(accountIdOf(number))) number++;
  return accountIdOf(number);
}

/** `login` adds the next demo account, enabled; `list` answers every account and whether it is enabled. */
export function accountActions(accounts: Accounts, store: string, clock: () => number): AccountActions {
  const stored = async () => (await accounts.list({ argument: { store } })).accounts;
  return {
    async login() {
      const id = nextAccountId((await stored()).map((account) => account.id));
      mkdirSync(dirname(store), { recursive: true });
      await accounts.upsert({ argument: { store, account: { id, email: id, label: id, enabled: true, addedAt: clock() } } });
      return { added: id };
    },
    async list() {
      return { accounts: (await stored()).map((account) => ({ id: account.id, enabled: account.enabled !== false })) };
    },
  };
}
