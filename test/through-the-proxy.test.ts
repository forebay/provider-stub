import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunningHost } from "@weivel/typescript/program";
import { freePort } from "@weivel/typescript/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { bundled, homeWith, hostIn, loggedIn, REPOSITORY, stubInstall, type Home, type Install } from "./fixtures/home.js";

const RUN_BOUND = 60_000;
const PROXY = join(REPOSITORY, "siblings", "claude-code-proxy");
const MODEL = "stub-model";
const SERVED_TEXT = "Hello from provider-stub: the provider pipeline works end to end. (served by stub-model)";
const CANCELLED_LINE = "provider-stub's call was cancelled before it was served";
const UNREACHABLE_UPSTREAM = "http://127.0.0.1:9";

interface Answer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

let bundles: string;
let proxyBundle: string;
let stubBundle: string;
const homes: Home[] = [];
const hosts: RunningHost[] = [];

function messages(stream: boolean): string {
  return JSON.stringify({ model: MODEL, max_tokens: 16, stream, messages: [{ role: "user", content: "hi" }] });
}

function proxyInstall(port: number): Install {
  const manifest = JSON.parse(readFileSync(join(PROXY, "plugin.json"), "utf8"));
  return { manifest, bundle: proxyBundle, settings: { proxy: { port }, upstream: UNREACHABLE_UPSTREAM } };
}

function options(port: number, method: string, path: string): object {
  return { host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json" } };
}

function sent(port: number, method: string, path: string, body?: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(options(port, method, path), (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: Buffer.concat(chunks).toString("utf8") }));
      incoming.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

/** Sends `body` and goes away after `milliseconds`, before any answer arrived, answering once the connection closed. */
function abandonedAfter(port: number, body: string, milliseconds: number): Promise<void> {
  const outgoing = request(options(port, "POST", "/v1/messages"));
  const closed = new Promise<void>((resolve) => outgoing.on("close", () => resolve()));
  outgoing.on("error", () => undefined);
  outgoing.end(body);
  setTimeout(() => outgoing.destroy(), milliseconds);
  return closed;
}

function waited(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function listening(port: number): Promise<void> {
  for (;;) {
    const answer = await sent(port, "GET", "/health").catch(() => undefined);
    if (answer?.status === 200) return;
    await waited(20);
  }
}

/** A home with the stub logged in once through the program's ACTION mode, then serving beside the pinned proxy. */
async function served(stubSettings: Record<string, unknown> = {}): Promise<{ home: Home; host: RunningHost; port: number }> {
  const port = await freePort();
  const home = homeWith([proxyInstall(port), stubInstall(stubBundle, stubSettings)]);
  homes.push(home);
  const login = await hostIn(home, ["action", "provider-stub", "login", "{}"]);
  expect(await login.ended).toBe(0);
  const host = await hostIn(home);
  hosts.push(host);
  await listening(port);
  return { home, host, port };
}

beforeAll(async () => {
  bundles = mkdtempSync(join(tmpdir(), "stub-proxy-bundles-"));
  proxyBundle = await bundled(join(PROXY, "src", "plugin.ts"), join(bundles, "proxy"));
  stubBundle = await bundled(join(REPOSITORY, "src", "plugin.ts"), join(bundles, "stub"));
}, RUN_BOUND);

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.stop();
  for (const home of homes.splice(0)) home.remove();
});

afterAll(() => rmSync(bundles, { recursive: true, force: true }));

describe("provider-stub behind the pinned claude-code-proxy, in one home", () => {
  it("answers a plain request with the stub's canned reply", async () => {
    const { port } = await served();

    const answer = await sent(port, "POST", "/v1/messages", messages(false));

    expect(answer.status, answer.body).toBe(200);
    expect(JSON.parse(answer.body)).toMatchObject({ type: "message", model: MODEL, content: [{ type: "text", text: SERVED_TEXT }] });
  }, RUN_BOUND);

  it("relays a streamed request as Anthropic events", async () => {
    const { port } = await served();

    const answer = await sent(port, "POST", "/v1/messages", messages(true));

    expect(answer.status, answer.body).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/event-stream");
    expect(answer.body).toContain("event: message_start");
    expect(answer.body).toContain(SERVED_TEXT);
    expect(answer.body).toContain("event: message_stop");
  }, RUN_BOUND);

  it("reaches the stub's cancel when the client goes away during the latency wait", async () => {
    const { home, host, port } = await served({ latency_ms: 30_000 });

    await abandonedAfter(port, messages(false), 1_000);
    await waited(500);
    await host.stop();

    expect(loggedIn(home)).toContain(CANCELLED_LINE);
  }, RUN_BOUND);
});
