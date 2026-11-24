import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunningHost } from "@weivel/typescript/program";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bundled, homeWith, hostIn, realPlacesSnapshot, REPOSITORY, stubInstall, type Home, type Install } from "./fixtures/home.js";

const realBefore = realPlacesSnapshot();
const RUN_BOUND = 60_000;
const LONG_LATENCY = 30_000;
const DEFAULT_TEXT = "Hello from provider-stub: the provider pipeline works end to end. (served by stub-model)";

interface Answered {
  readonly kind: number;
  readonly response?: { readonly model: string; readonly stop_reason: string; readonly content: readonly { readonly kind: number; readonly text: string }[] };
  readonly failure?: { readonly status: number; readonly body: string; readonly headers: readonly { name: string; value: string }[]; readonly has_retry_after?: number; readonly retry_after_milliseconds?: number };
  readonly stream?: unknown;
  readonly message?: string;
}

interface Calls {
  count(): number;
  models(): Promise<{ provider: { provider: string; models: { id: string; name: string }[]; has_ranking: number; default_model: string } }>;
  handle(argument: unknown): Promise<Answered>;
  next(stream: unknown): Promise<{ kind: number; event?: { kind: number; text?: string } }>;
  cancel(token: bigint): Promise<unknown>;
}

interface Accounts {
  login(): Promise<{ added: string }>;
  list(): Promise<{ accounts: { id: string; enabled: boolean }[] }>;
}

interface Running {
  readonly home: Home;
  readonly host: RunningHost;
}

let bundles: string;
let stubBundle: string;
let consumerBundle: string;
const homes: Home[] = [];
const hosts: RunningHost[] = [];

function consumerInstall(): Install {
  const manifest = {
    api: 1,
    importName: "consumer",
    id: "consumer",
    version: "1.0.0",
    entry: "index.js",
    capabilities: { provides: [], consumes: ["forebay.provider"] },
    services: { provides: ["consumer:calls"], consumes: [] },
    config: { defaults: {} },
  };
  return { manifest, bundle: consumerBundle, settings: {} };
}

function home(settings: Record<string, unknown> = {}): Home {
  const made = homeWith([stubInstall(stubBundle, settings), consumerInstall()]);
  homes.push(made);
  return made;
}

async function serving(made: Home): Promise<RunningHost> {
  const host = await hostIn(made);
  hosts.push(host);
  return host;
}

async function started(settings: Record<string, unknown> = {}): Promise<Running> {
  const made = home(settings);
  return { home: made, host: await serving(made) };
}

function callsOf(host: RunningHost): Calls {
  const calls = host.service<Calls>("consumer", "consumer:calls");
  if (calls === undefined) throw new Error("the consumer registered no calls service");
  return calls;
}

function accountsOf(host: RunningHost): Accounts {
  const accounts = host.service<Accounts>("provider-stub", "provider-stub:accounts");
  if (accounts === undefined) throw new Error("provider-stub registered no accounts service");
  return accounts;
}

function argument(token: bigint, stream = 0): unknown {
  return { request: { model: "stub-model", messages: [{ role: "user", content: [{ kind: 1, text: "hi" }] }], stream }, headers: [], token };
}

async function action(made: Home, name: string): Promise<number> {
  const host = await hostIn(made, ["action", "provider-stub", name, "{}"]);
  return host.ended;
}

function storeIn(made: Home): string | undefined {
  const found = readdirSync(made.base, { recursive: true, encoding: "utf8" }).find((file) => file.endsWith("accounts.json"));
  return found === undefined ? undefined : join(made.base, found);
}

function waited(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

beforeAll(async () => {
  bundles = mkdtempSync(join(tmpdir(), "stub-bundles-"));
  stubBundle = await bundled(join(REPOSITORY, "src", "plugin.ts"), join(bundles, "stub"));
  consumerBundle = await bundled(join(REPOSITORY, "test", "fixtures", "consumer", "index.ts"), join(bundles, "consumer"));
}, RUN_BOUND);

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.stop();
  for (const made of homes.splice(0)) made.remove();
});

afterAll(() => rmSync(bundles, { recursive: true, force: true }));

describe("provider-stub under the host program, over runtime in a temporary home", () => {
  it("provides forebay.provider past the host's provide-time contract check", async () => {
    const { host } = await started();

    expect(callsOf(host).count()).toBe(1);
  }, RUN_BOUND);

  it("offers no models before an account logs in, and its stub models after", async () => {
    const { host } = await started();

    const before = await callsOf(host).models();
    const added = await accountsOf(host).login();
    const after = await callsOf(host).models();

    expect(before.provider).toMatchObject({ provider: "provider-stub", models: [] });
    expect(added.added).toBe("stub-1@example.com");
    expect(after.provider).toMatchObject({ provider: "provider-stub", has_ranking: 0, default_model: "stub-model" });
    expect(after.provider.models.map((model) => model.id)).toEqual(["stub-model", "stub-pro", "stub-fast"]);
  }, RUN_BOUND);

  it("answers 503 in the error shape C writes, naming the login action, when no account can serve", async () => {
    const { host } = await started();

    const answer = await callsOf(host).handle(argument(1n));

    expect(answer.kind).toBe(2);
    expect(answer.failure).toMatchObject({ status: 503, has_retry_after: 0 });
    expect(JSON.parse(answer.failure!.body)).toMatchObject({ type: "error", error: { type: "api_error", message: expect.stringContaining("login action") } });
  }, RUN_BOUND);

  it.each(["hybrid", "round-robin"])("answers 503 saying when to retry while every account is cooling, under %s", async (strategy) => {
    const { host } = await started({ fail_rate: 1, account_selection_strategy: strategy });
    await accountsOf(host).login();
    const calls = callsOf(host);

    const failed = await calls.handle(argument(1n));
    const cooling = await calls.handle(argument(2n));

    expect(failed.failure?.status).toBe(529);
    expect(cooling.failure).toMatchObject({ status: 503, has_retry_after: 1 });
    expect(JSON.parse(cooling.failure!.body)).toMatchObject({ type: "error", error: { type: "api_error", message: expect.stringContaining("cooling") } });
  }, RUN_BOUND);

  it("answers THROWN with the message of a setting it cannot read", async () => {
    const { host } = await started({ response_text: 5 });
    await accountsOf(host).login();

    const answer = await callsOf(host).handle(argument(1n));

    expect(answer.kind).toBe(4);
    expect(answer.message).toContain("response_text");
  }, RUN_BOUND);

  it("refuses an account_selection_strategy it does not know", async () => {
    const { host } = await started({ account_selection_strategy: "fastest" });
    await accountsOf(host).login();

    const answer = await callsOf(host).handle(argument(1n));

    expect(answer.kind).toBe(4);
    expect(answer.message).toContain("account_selection_strategy");
  }, RUN_BOUND);

  it("answers THROWN with the message of an acquire the accounts service refuses", async () => {
    const { home: made, host } = await started();
    await accountsOf(host).login();
    writeFileSync(storeIn(made)!, "not a store");

    const answer = await callsOf(host).handle(argument(1n));

    expect(answer.kind).toBe(4);
    expect(answer.message).toContain("provider-stub could not serve the request");
  }, RUN_BOUND);

  it("answers a plain reply with the canned text", async () => {
    const { host } = await started();
    await accountsOf(host).login();

    const answer = await callsOf(host).handle(argument(1n));

    expect(answer.kind, answer.message).toBe(1);
    expect(answer.response).toMatchObject({ model: "stub-model", stop_reason: "end_turn", content: [{ kind: 1, text: DEFAULT_TEXT }] });
  }, RUN_BOUND);

  it("answers a streamed reply as the six events of a text message, then its end", async () => {
    const { host } = await started();
    await accountsOf(host).login();
    const calls = callsOf(host);

    const answer = await calls.handle(argument(1n, 1));
    const kinds: number[] = [];
    let text = "";
    for (let next = await calls.next(answer.stream); next.kind === 1; next = await calls.next(answer.stream)) {
      kinds.push(next.event!.kind);
      text += next.event!.text ?? "";
    }

    expect(answer.kind, answer.message).toBe(3);
    expect(kinds).toEqual([1, 2, 3, 7, 8, 9]);
    expect(text).toBe(DEFAULT_TEXT);
  }, RUN_BOUND);

  it("ends a call early when it is cancelled during the latency wait", async () => {
    const { host } = await started({ latency_ms: LONG_LATENCY });
    await accountsOf(host).login();
    const calls = callsOf(host);
    const began = Date.now();

    const answering = calls.handle(argument(7n));
    await waited(200);
    await calls.cancel(7n);
    const answer = await answering;

    expect(answer.kind).toBe(4);
    expect(Date.now() - began).toBeLessThan(LONG_LATENCY / 2);
  }, RUN_BOUND);

  it("answers a cancel of a token it does not know, and changes nothing", async () => {
    const { host } = await started();
    await accountsOf(host).login();
    const calls = callsOf(host);

    await expect(calls.cancel(99n)).resolves.toBeUndefined();
    const answer = await calls.handle(argument(99n));

    expect(answer.kind, answer.message).toBe(1);
  }, RUN_BOUND);

  it("cancels only the call its token names when two run together", async () => {
    const { host } = await started({ latency_ms: 1_500 });
    await accountsOf(host).login();
    const calls = callsOf(host);

    const cancelled = calls.handle(argument(1n));
    const kept = calls.handle(argument(2n));
    await waited(200);
    await calls.cancel(1n);

    expect((await cancelled).kind).toBe(4);
    expect((await kept).kind).toBe(1);
  }, RUN_BOUND);

  it("logs an account in and lists the accounts through the program's ACTION mode", async () => {
    const made = home();

    const loggedIn = await action(made, "login");
    const listed = await action(made, "accounts");
    const unknown = await action(made, "no-such-action");
    const host = await serving(made);
    const models = await callsOf(host).models();

    expect(loggedIn).toBe(0);
    expect(listed).toBe(0);
    expect(unknown).not.toBe(0);
    expect(JSON.parse(readFileSync(storeIn(made)!, "utf8"))).toMatchObject({ accounts: [{ id: "stub-1@example.com", enabled: true }] });
    expect(models.provider.models.map((model) => model.id)).toEqual(["stub-model", "stub-pro", "stub-fast"]);
  }, RUN_BOUND);

  it("lists the accounts through its accounts service", async () => {
    const { host } = await started();
    const accounts = accountsOf(host);

    await accounts.login();
    await accounts.login();

    expect(await accounts.list()).toEqual({ accounts: [{ id: "stub-1@example.com", enabled: true }, { id: "stub-2@example.com", enabled: true }] });
  }, RUN_BOUND);

  it("left the real home's places as they were", () => {
    expect(realPlacesSnapshot()).toEqual(realBefore);
  });
});
