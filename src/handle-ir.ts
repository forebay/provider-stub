import type { AccountsService, HandleIrResult, IrFailure, IrRequest } from "@forebay/host";
import { cannedResponse } from "./canned-reply.js";
import { DEFAULT_MODEL_ID } from "./models.js";
import type { StubSettings } from "./settings.js";
import { stubEvents } from "./stub-stream.js";

const ERROR_COOLDOWN_BASE_MILLISECONDS = 250;
const ERROR_COOLDOWN_MAX_MILLISECONDS = 2000;
const OVERLOADED_STATUS = 529;

/** What answering a request reaches outside itself for; every one is a seam so a test decides it. */
export interface HandleIrDependencies {
  accounts: () => AccountsService;
  store: string;
  settings: () => StubSettings;
  clock: () => number;
  random: () => number;
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  log: (message: string) => void;
}

function failure(status: number, body: string, contentType = "text/plain"): IrFailure {
  return { status, headers: { "content-type": contentType }, body };
}

function overloaded(): IrFailure {
  return failure(OVERLOADED_STATUS, JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Stub overloaded (fail_rate)" } }), "application/json");
}

function modelOf(request: IrRequest): string {
  return request.model === "" ? DEFAULT_MODEL_ID : request.model;
}

function streams(settings: StubSettings, request: IrRequest): boolean {
  return settings.streaming ?? request.stream;
}

/**
 * Builds the `handleIr` of the stub provider.
 *
 * @remarks A refusal of the accounts service reaches the host as the service's own thrown error, which names what to send.
 *
 * @remarks Reporting is an effect after the decision: a report that throws is logged and the answer is still returned.
 * An abort during the latency wait rejects and reports nothing, since no request was served.
 *
 * @implNote The failure roll comes before the latency wait, so a failing stub fails at once. The
 * roll is reported to the accounts service as an `error`, which cools the account down for a short
 * jittered while, so a stub with `fail_rate` set also exercises the rotation and cooldown path.
 */
export function createHandleIr(dependencies: HandleIrDependencies) {
  const { store, clock, random, sleep, log } = dependencies;

  function report(id: string, outcome: "success" | "error"): void {
    try {
      reportOutcome(id, outcome);
    } catch (cause) {
      log(`could not report ${outcome} for ${id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function reportOutcome(id: string, outcome: "success" | "error"): void {
    dependencies.accounts().report({
      store,
      id,
      outcome,
      now: clock(),
      random: random(),
      baseMilliseconds: ERROR_COOLDOWN_BASE_MILLISECONDS,
      maxMilliseconds: ERROR_COOLDOWN_MAX_MILLISECONDS,
    });
  }

  async function serve(id: string, request: IrRequest, signal: AbortSignal, settings: StubSettings): Promise<HandleIrResult> {
    if (settings.failRate > 0 && random() < settings.failRate) {
      report(id, "error");
      return overloaded();
    }
    if (settings.latencyMilliseconds > 0) await sleep(settings.latencyMilliseconds, signal);
    signal.throwIfAborted();
    report(id, "success");
    const model = modelOf(request);
    return streams(settings, request) ? stubEvents(model, settings.responseText) : cannedResponse(model, settings.responseText);
  }

  return async (request: IrRequest, signal: AbortSignal): Promise<HandleIrResult> => {
    const settings = dependencies.settings();
    const acquired = dependencies.accounts().acquire({ store, strategy: settings.accountSelectionStrategy, now: clock() });
    if (acquired.none === true || acquired.id === undefined) return failure(400, "no stub account, run the login action");
    if (acquired.available === false) return failure(503, "all stub accounts are cooling down");
    return serve(acquired.id, request, signal, settings);
  };
}
