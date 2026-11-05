import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IrFailure, IrResponse } from "@forebay/host";
import { openTestAccounts } from "../test/accounts-library.js";
import type { TestAccounts } from "../test/accounts-library.js";
import { fakeSecrets } from "../test/fake-secrets.js";
import { DEFAULT_SETTINGS } from "../test/settings.js";
import { createHandleIr } from "./handle-ir.js";
import { createLoginAction, listAccountsAction } from "./login-action.js";

const NOW = 1_700_000_000_000;
const NEVER_ABORTED = new AbortController().signal;

let library: TestAccounts;
let secrets: ReturnType<typeof fakeSecrets>;

beforeEach(() => {
  library = openTestAccounts();
  secrets = fakeSecrets();
});

afterEach(() => {
  library.close();
});

const login = () => createLoginAction({ accounts: () => library.accounts, store: library.store, secrets, clock: () => NOW });
const handleIr = () =>
  createHandleIr({
    accounts: () => library.accounts,
    store: library.store,
    settings: () => DEFAULT_SETTINGS,
    clock: () => NOW,
    random: () => 0.9,
    sleep: async () => {},
  });
const request = { model: "stub-model", messages: [{ role: "user", content: [{ kind: "text" as const, text: "hi" }] }], stream: false };

describe("the login action", () => {
  it("adds stub-1@example.com first and stub-2@example.com next", async () => {
    expect(await login()()).toMatchObject({ added: "stub-1@example.com" });
    expect(await login()()).toMatchObject({ added: "stub-2@example.com" });
    expect(library.accounts.list({ store: library.store }).accounts?.map((account) => account.id)).toEqual(["stub-1@example.com", "stub-2@example.com"]);
  });

  it("takes the next free number when an earlier account was removed", async () => {
    await login()();
    await login()();
    library.accounts.remove({ store: library.store, id: "stub-1@example.com" });
    expect(await login()()).toMatchObject({ added: "stub-3@example.com" });
  });

  it("keeps the token in the plugin's secrets under account.<id>.access and out of the store", async () => {
    await login()();
    expect(secrets.entries.get("account.stub-1@example.com.access")).toMatch(/^stub-access-/);
    expect(readFileSync(library.store, "utf8")).not.toMatch(/stub-access|"access"/);
  });

  it("refuses, naming the cause, on a host with no secret store", async () => {
    const withoutSecrets = createLoginAction({ accounts: () => library.accounts, store: library.store, secrets: undefined, clock: () => NOW });
    await expect(withoutSecrets()).rejects.toThrow(/secret store/);
  });

  it("lets a request be answered with the configured text straight after a login", async () => {
    expect(((await handleIr()(request, NEVER_ABORTED)) as IrFailure).status).toBe(400);
    await login()();
    const reply = (await handleIr()(request, NEVER_ABORTED)) as IrResponse;
    expect(reply.content).toEqual([{ kind: "text", text: `${DEFAULT_SETTINGS.responseText} (served by stub-model)` }]);
  });
});

describe("the accounts action", () => {
  it("lists the account ids with whether each is enabled", async () => {
    await login()();
    const listed = listAccountsAction({ accounts: () => library.accounts, store: library.store })();
    expect(listed).toEqual({ accounts: [{ id: "stub-1@example.com", enabled: true }] });
  });

  it("lists nothing when no account was added", () => {
    expect(listAccountsAction({ accounts: () => library.accounts, store: library.store })()).toEqual({ accounts: [] });
  });
});
