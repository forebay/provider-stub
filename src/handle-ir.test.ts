import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountsService, IrFailure, IrRequest, IrResponse, IrStreamEvent } from "@forebay/host";
import { contractProblems } from "../test/contract-answers.js";
import { openTestAccounts } from "../test/accounts-library.js";
import type { TestAccounts } from "../test/accounts-library.js";
import { DEFAULT_SETTINGS } from "../test/settings.js";
import { abortableSleep } from "./abortable-sleep.js";
import { createHandleIr } from "./handle-ir.js";
import type { StubSettings } from "./settings.js";

const NOW = 1_700_000_000_000;
const NEVER_ABORTED = new AbortController().signal;

let library: TestAccounts;
let sleeps: number[];
let logged: string[];

beforeEach(() => {
  library = openTestAccounts();
  sleeps = [];
  logged = [];
});

afterEach(() => {
  library.close();
});

function request(fields: Partial<IrRequest> = {}): IrRequest {
  return { model: "stub-model", messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }], stream: false, ...fields };
}

function addAccount(id = "stub-1@example.com"): void {
  library.accounts.upsert({ store: library.store, account: { id, label: id, enabled: true } });
}

function handleWith(settings: Partial<StubSettings>, random = 0.9, accounts: AccountsService = library.accounts) {
  return createHandleIr({
    accounts: () => accounts,
    log: (message) => logged.push(message),
    loginCommand: "forebay-host action claude-code-loader stub-auth login",
    store: library.store,
    settings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
    clock: () => NOW,
    random: () => random,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });
}

async function answer(settings: Partial<StubSettings>, fields: Partial<IrRequest> = {}, random = 0.9) {
  addAccount();
  const result = await handleWith(settings, random)(request(fields), NEVER_ABORTED);
  expect(contractProblems("HandleIrAnswer", result)).toEqual([]);
  return result;
}

const textOf = (result: unknown) => ((result as IrResponse).content[0] as { text: string }).text;

describe("the reply", () => {
  it("answers one text block carrying the configured text served by the requested model", async () => {
    const result = (await answer({ responseText: "custom" }, { model: "stub-pro" })) as IrResponse;
    expect(result.model).toBe("stub-pro");
    expect(textOf(result)).toBe("custom (served by stub-pro)");
  });

  it("serves the configured text, never a built in one, for a model it was not built for", async () => {
    const result = await answer({ responseText: "custom text" }, { model: "claude-opus-4-ignored" });
    expect(textOf(result)).toBe("custom text (served by claude-opus-4-ignored)");
  });

  it("serves the manifest default text when nothing else is configured", async () => {
    expect(textOf(await answer({}))).toBe(`${DEFAULT_SETTINGS.responseText} (served by stub-model)`);
  });

  it("is the canned canonical reply: fixed id, end_turn, one input and twelve output tokens", async () => {
    const result = (await answer({ responseText: "hi there" }, { model: "stub-pro" })) as IrResponse;
    expect(result).toEqual({
      id: "msg_stub_0001",
      model: "stub-pro",
      content: [{ kind: "text", text: "hi there (served by stub-pro)" }],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 12 },
    });
  });

  it.each([["empty", ""], ["whitespace only", "  \n\t "]])("serves the built in text when response_text is %s", async (_label, blank) => {
    expect(textOf(await answer({ responseText: blank }, { model: "stub-pro" }))).toBe("stub response (served by stub-pro)");
  });

  it("answers as stub-model when the request names no model", async () => {
    expect(((await answer({}, { model: "" })) as IrResponse).model).toBe("stub-model");
  });
});

describe("streaming", () => {
  it("answers the six events when the setting forces a stream", async () => {
    const result = (await answer({ responseText: "x", streaming: true })) as IrStreamEvent[];
    expect(result.map((event) => event.event)).toContain("message_stop");
    expect(result).toHaveLength(6);
  });

  it("honours the request's own flag when the setting is null", async () => {
    expect(await answer({ streaming: null }, { stream: true })).toHaveLength(6);
    expect(Array.isArray(await answer({ streaming: null }, { stream: false }))).toBe(false);
  });

  it("answers a single reply when the setting forces streaming off, whatever the request asks", async () => {
    const result = await answer({ streaming: false }, { stream: true });
    expect(Array.isArray(result)).toBe(false);
    expect((result as IrResponse).id).toBe("msg_stub_0001");
  });
});

describe("simulated failure", () => {
  it("answers 529 overloaded when the roll falls under fail_rate", async () => {
    const failure = (await answer({ failRate: 0.5 }, {}, 0.1)) as IrFailure;
    expect(failure.status).toBe(529);
    expect(failure.headers["content-type"]).toBe("application/json");
    expect(failure.body).toContain('"type":"overloaded_error"');
    expect(failure.body).toContain("Stub overloaded (fail_rate)");
  });

  it("serves normally when the roll falls at or over fail_rate", async () => {
    expect(await answer({ failRate: 0.5 }, {}, 0.5)).toHaveProperty("id", "msg_stub_0001");
  });

  it("fails the first request at fail_rate 1, whatever the roll", async () => {
    expect(((await answer({ failRate: 1 }, {}, 0.99)) as IrFailure).status).toBe(529);
  });

  it("never fails at fail_rate 0, even for the lowest roll", async () => {
    expect(((await answer({ failRate: 0 }, {}, 0)) as IrResponse).id).toBe("msg_stub_0001");
  });

  it("fails before the latency wait", async () => {
    const failure = (await answer({ failRate: 1, latencyMilliseconds: 500 }, {}, 0)) as IrFailure;
    expect(failure.status).toBe(529);
    expect(sleeps).toEqual([]);
  });

  it("reports the failure as an error, so the account cools down and the next request is refused", async () => {
    addAccount();
    const handle = handleWith({ failRate: 1 }, 0);
    expect(((await handle(request(), NEVER_ABORTED)) as IrFailure).status).toBe(529);
    const next = (await handle(request(), NEVER_ABORTED)) as IrFailure;
    expect(next).toMatchObject({ status: 503, body: "all stub accounts are cooling down" });
    const [account] = library.accounts.list({ store: library.store }).accounts ?? [];
    expect(account?.coolingDownUntil).toBeGreaterThan(NOW);
  });
});

describe("latency", () => {
  it("waits the configured milliseconds before replying", async () => {
    await answer({ latencyMilliseconds: 42 });
    expect(sleeps).toEqual([42]);
  });

  it("does not wait at all at zero", async () => {
    await answer({ latencyMilliseconds: 0 });
    expect(sleeps).toEqual([]);
  });
});

describe("the account", () => {
  it("answers 400 telling the user to run the login action when there is no account", async () => {
    const failure = (await handleWith({})(request(), NEVER_ABORTED)) as IrFailure;
    expect(failure).toMatchObject({ status: 400, body: "no stub account, run forebay-host action claude-code-loader stub-auth login" });
    expect(contractProblems("HandleIrAnswer", failure)).toEqual([]);
  });

  it("reports a success, leaving the account usable and used", async () => {
    await answer({});
    const [account] = library.accounts.list({ store: library.store }).accounts ?? [];
    expect(account?.coolingDownUntil ?? 0).toBeLessThanOrEqual(NOW);
    expect(account?.lastUsed).toBe(NOW);
  });

  it("treats a strategy it does not know as the library does, serving the request", async () => {
    expect(await answer({ accountSelectionStrategy: "no-such-strategy" })).toHaveProperty("id", "msg_stub_0001");
  });

  it("lets the accounts service's refusal through, naming what to send", async () => {
    const handle = createHandleIr({
      accounts: () => library.accounts,
      store: "",
      settings: () => DEFAULT_SETTINGS,
      clock: () => NOW,
      random: () => 0.9,
      sleep: async () => {},
      loginCommand: "forebay-host action claude-code-loader stub-auth login",
      log: () => {},
    });
    await expect(handle(request(), NEVER_ABORTED)).rejects.toThrow(/store is empty/);
  });
});

describe("a failing report", () => {
  const throwingReport = (): AccountsService => ({
    ...library.accounts,
    report: () => {
      throw new Error("store is locked");
    },
  });

  it("does not discard the reply, and logs the failure", async () => {
    addAccount();
    const result = (await handleWith({}, 0.9, throwingReport())(request(), NEVER_ABORTED)) as IrResponse;
    expect(result.id).toBe("msg_stub_0001");
    expect(logged.join(" ")).toMatch(/store is locked/);
  });

  it("does not discard the 529 either", async () => {
    addAccount();
    const result = (await handleWith({ failRate: 1 }, 0, throwingReport())(request(), NEVER_ABORTED)) as IrFailure;
    expect(result.status).toBe(529);
    expect(logged.join(" ")).toMatch(/store is locked/);
  });
});

describe("an abort", () => {
  it("stops during the latency wait and reports nothing", async () => {
    addAccount();
    const report = vi.fn(library.accounts.report);
    const controller = new AbortController();
    const handle = createHandleIr({
      accounts: () => ({ ...library.accounts, report }),
      store: library.store,
      settings: () => ({ ...DEFAULT_SETTINGS, latencyMilliseconds: 60000 }),
      clock: () => NOW,
      random: () => 0.9,
      sleep: abortableSleep,
      loginCommand: "forebay-host action claude-code-loader stub-auth login",
      log: () => {},
    });
    const pending = handle(request(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/abort/i);
    expect(report).not.toHaveBeenCalled();
  });

  it("reports nothing when the signal fell during a wait that ignored it", async () => {
    addAccount();
    const report = vi.fn(library.accounts.report);
    const controller = new AbortController();
    const handle = createHandleIr({
      accounts: () => ({ ...library.accounts, report }),
      store: library.store,
      settings: () => ({ ...DEFAULT_SETTINGS, latencyMilliseconds: 5 }),
      clock: () => NOW,
      random: () => 0.9,
      sleep: async () => controller.abort(),
      loginCommand: "forebay-host action claude-code-loader stub-auth login",
      log: () => {},
    });
    await expect(handle(request(), controller.signal)).rejects.toThrow(/abort/i);
    expect(report).not.toHaveBeenCalled();
  });
});
