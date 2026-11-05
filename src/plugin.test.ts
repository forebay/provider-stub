import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AccountsService, IrFailure, IrRequest, IrResponse, Provider } from "@forebay/host";
import type { PluginContext } from "@weivel/typescript";
import { openTestAccounts } from "../test/accounts-library.js";
import type { TestAccounts } from "../test/accounts-library.js";
import { fakeSecrets } from "../test/fake-secrets.js";
import { MANIFEST_DEFAULTS } from "../test/settings.js";
import plugin from "./plugin.js";

const MANIFEST = JSON.parse(readFileSync(join(import.meta.dirname, "..", "plugin.json"), "utf8"));
const NEVER_ABORTED = new AbortController().signal;
const REQUEST: IrRequest = { model: "stub-pro", messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }], stream: false };

interface Hosted {
  context: PluginContext;
  provided: Map<string, unknown>;
  registered: Map<string, Record<string, (argument: unknown) => unknown>>;
  settings: Record<string, unknown>;
  pluginDirectory: string;
}

let library: TestAccounts;
let directories: string[];

beforeEach(() => {
  library = openTestAccounts();
  directories = [];
});

afterEach(() => {
  library.close();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

function host(accounts: AccountsService | null): Hosted {
  const pluginDirectory = mkdtempSync(join(tmpdir(), "stub-auth-plugin-"));
  directories.push(pluginDirectory);
  const settings: Record<string, unknown> = { ...MANIFEST_DEFAULTS };
  const provided = new Map<string, unknown>();
  const registered: Hosted["registered"] = new Map();
  const context = {
    capability: (id: string) => ({ id }),
    service: (id: string) => ({ id }),
    config: { get: (key: string) => settings[key], all: () => settings },
    paths: { plugin: pluginDirectory },
    secrets: fakeSecrets(),
    manifest: { id: "stub-auth" },
    provide: (type: { id: string }, implementation: unknown) => provided.set(type.id, implementation),
    services: {
      get: (type: { id: string }) => (type.id === "accounts" ? accounts ?? undefined : undefined),
      register: (type: { id: string }, implementation: Hosted["registered"] extends Map<string, infer V> ? V : never) => registered.set(type.id, implementation),
    },
  } as unknown as PluginContext;
  return { context, provided, registered, settings, pluginDirectory };
}

async function activated(accounts: AccountsService | null = library.accounts): Promise<Hosted & { provider: Provider }> {
  const hosted = host(accounts);
  await plugin.activate(hosted.context);
  return { ...hosted, provider: hosted.provided.get("provider") as Provider };
}

describe("the manifest", () => {
  it("is a provider that consumes the accounts service, with the defaults the stub always had", () => {
    expect(MANIFEST.id).toBe("stub-auth");
    expect(MANIFEST.capabilities).toEqual(["provider"]);
    expect(MANIFEST.services.consumes).toEqual(["accounts"]);
    expect(MANIFEST.config.defaults).toEqual({
      account_selection_strategy: "hybrid",
      logging: true,
      response_text: "Hello from stub-auth: the basekit auth pipeline works end to end.",
      model_count: 3,
      latency_ms: 0,
      fail_rate: 0,
      streaming: null,
    });
  });

  it("binds each action to a method of a service the plugin registers", async () => {
    const { registered } = await activated();
    expect(Object.keys(MANIFEST.actions).sort()).toEqual(["accounts", "login"]);
    for (const action of Object.values(MANIFEST.actions) as Array<{ call: { service: string; method: string } }>) {
      expect(MANIFEST.services.provides).toContain(action.call.service);
      expect(typeof registered.get(action.call.service)?.[action.call.method]).toBe("function");
    }
  });
});

describe("activation", () => {
  it("provides the provider capability and offers the three stub models", async () => {
    const { provider } = await activated();
    expect((await provider.models()).models.map((model) => model.id)).toEqual(["stub-model", "stub-pro", "stub-fast"]);
  });

  it("follows model_count as it changes", async () => {
    const { provider, settings } = await activated();
    settings.model_count = 1;
    expect((await provider.models()).models.map((model) => model.id)).toEqual(["stub-model"]);
  });

  it("answers 400 until the login action ran, then the configured text, with the store in the plugin's folder", async () => {
    const { provider, registered, settings, pluginDirectory } = await activated();
    expect(((await provider.handleIr(REQUEST, NEVER_ABORTED)) as IrFailure).status).toBe(400);
    settings.response_text = "after login";
    await registered.get("stub-auth:accounts")?.login?.({});
    const reply = (await provider.handleIr(REQUEST, NEVER_ABORTED)) as IrResponse;
    expect(reply.content).toEqual([{ kind: "text", text: "after login (served by stub-pro)" }]);
    expect(library.accounts.list({ store: join(pluginDirectory, "accounts.json") }).accounts).toHaveLength(1);
  });

  it("lists the accounts the login action added", async () => {
    const { registered } = await activated();
    await registered.get("stub-auth:accounts")?.login?.({});
    expect(await registered.get("stub-auth:accounts")?.list?.({})).toEqual({ accounts: [{ id: "stub-1@example.com", enabled: true }] });
  });

  it("names the missing accounts service when a request needs it, rather than answering as if there were no account", async () => {
    const { provider } = await activated(null);
    await expect(Promise.resolve(provider.handleIr(REQUEST, NEVER_ABORTED))).rejects.toThrow(/accounts service/);
  });

  it("deactivates without throwing", async () => {
    await expect(Promise.resolve(plugin.deactivate())).resolves.toBeUndefined();
  });
});
