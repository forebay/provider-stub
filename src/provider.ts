import { Cancellations, waitedUnlessCancelled } from "./cancellations.js";
import { ACQUIRE, HANDLE, NEXT, REPORT_OUTCOME, WEIVEL_LOG, type Accounts, type AcquireAnswer, type Config, type HandleAnswer, type HandleArgument, type Log, type Provider } from "./contract.js";
import { DEFAULT_MODEL_ID, stubCatalog } from "./models.js";
import { cannedEvents, cannedResponse, overloaded } from "./replies.js";
import { readSettings, type StubSettings } from "./settings.js";

const ERROR_COOLDOWN_BASE_MILLISECONDS = 250;
const ERROR_COOLDOWN_MAX_MILLISECONDS = 2000;
const FAIL_RATE_STATUS = 529;
const UNAVAILABLE_STATUS = 503;
const CANCELLED_MESSAGE = "provider-stub's call was cancelled before it was served";

/** What serving a request reaches outside itself for; the clock and the dice are seams so a run decides them. */
export interface ProviderDependencies {
  readonly accounts: Accounts;
  readonly config: Config;
  readonly log: Log;
  /** The accounts store file. */
  readonly store: string;
  readonly clock: () => number;
  readonly random: () => number;
}

function logged(log: Log, level: number, message: string): void {
  void log.write({ level, message }).catch(() => undefined);
}

/** Records how a request went; a report that fails is logged, and the answer is still given. */
async function reported(dependencies: ProviderDependencies, id: string, outcome: number): Promise<void> {
  const { accounts, store, clock, random } = dependencies;
  const argument = {
    store,
    id,
    outcome,
    now: clock(),
    has_random: 1,
    random: random(),
    base_milliseconds: ERROR_COOLDOWN_BASE_MILLISECONDS,
    max_milliseconds: ERROR_COOLDOWN_MAX_MILLISECONDS,
  };
  try {
    await accounts.report({ argument });
  } catch (error) {
    logged(dependencies.log, WEIVEL_LOG.WARN, `provider-stub could not report how a request on ${id} went: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function unavailable(acquired: AcquireAnswer, now: number): HandleAnswer {
  const message = acquired.kind === ACQUIRE.CLAIMED ? "every stub account is cooling down" : "no stub account can serve: add one with the login action";
  const retryAfter = acquired.knows_available_at === 1 ? Math.max(0, acquired.available_at - now) : undefined;
  return { kind: HANDLE.FAILURE, failure: overloaded(UNAVAILABLE_STATUS, message, retryAfter) };
}

function streams(settings: StubSettings, argument: HandleArgument): boolean {
  return settings.streaming ?? argument.request.stream === 1;
}

function cancelled(log: Log): HandleAnswer {
  logged(log, WEIVEL_LOG.INFO, CANCELLED_MESSAGE);
  return { kind: HANDLE.THROWN, message: CANCELLED_MESSAGE };
}

/**
 * Serves one request on an account the pool hands out.
 * @implNote The failure roll comes before the latency wait, so a failing stub fails at once. It is reported as an
 * error, which cools the account down for a short jittered while, so `fail_rate` also exercises rotation and cooldown.
 */
async function served(dependencies: ProviderDependencies, argument: HandleArgument, signal: AbortSignal): Promise<HandleAnswer> {
  const settings = await readSettings(dependencies.config);
  const now = dependencies.clock();
  const acquired = await dependencies.accounts.acquire({ argument: { store: dependencies.store, strategy: settings.strategy, now } });
  if (acquired.kind !== ACQUIRE.CLAIMED || acquired.available !== 1 || acquired.id === undefined) return unavailable(acquired, now);
  if (settings.failRate > 0 && dependencies.random() < settings.failRate) {
    await reported(dependencies, acquired.id, REPORT_OUTCOME.ERROR);
    return { kind: HANDLE.FAILURE, failure: overloaded(FAIL_RATE_STATUS, "Stub overloaded (fail_rate)") };
  }
  const waited = settings.latencyMilliseconds <= 0 || (await waitedUnlessCancelled(settings.latencyMilliseconds, signal));
  if (!waited || signal.aborted) return cancelled(dependencies.log);
  await reported(dependencies, acquired.id, REPORT_OUTCOME.SUCCESS);
  const model = argument.request.model || DEFAULT_MODEL_ID;
  if (streams(settings, argument)) return { kind: HANDLE.STREAM, stream: { events: cannedEvents(model, settings.responseText) } };
  return { kind: HANDLE.RESPONSE, response: cannedResponse(model, settings.responseText) };
}

/** Whether the store holds an enabled account; a cooling one still counts, since it serves once it cools. */
export async function hasEnabledAccount(accounts: Accounts, store: string): Promise<boolean> {
  const { accounts: stored } = await accounts.list({ argument: { store } });
  return stored.some((account) => account.enabled !== false);
}

/** The stub's `forebay.provider` implementation. */
export function stubProvider(dependencies: ProviderDependencies): Provider {
  const cancellations = new Cancellations();
  return {
    async models() {
      const settings = await readSettings(dependencies.config);
      return { provider: stubCatalog(settings.modelCount, await hasEnabledAccount(dependencies.accounts, dependencies.store)) };
    },
    async handle({ argument }) {
      const signal = cancellations.begin(argument.token);
      try {
        return await served(dependencies, argument, signal);
      } finally {
        cancellations.end(argument.token);
      }
    },
    async next({ stream }) {
      const event = stream.events.shift();
      return event === undefined ? { kind: NEXT.END } : { kind: NEXT.EVENT, event };
    },
    async cancel({ argument }) {
      cancellations.cancel(argument.token);
    },
  };
}
