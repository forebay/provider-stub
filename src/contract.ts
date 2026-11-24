/**
 * The shapes weivel/typescript's binding gives the definitions this plugin provides and calls: each operation one
 * async method taking its input parameters by name and answering its answer struct without its sizes, counts and
 * storage, a NULL text left out and a NULL array answered empty. Only the members this plugin reads or writes are named.
 */

export interface Pair {
  readonly name: string;
  readonly value: string;
}

export interface IrUsage {
  readonly has_input_tokens: number;
  readonly input_tokens: number;
  readonly has_output_tokens: number;
  readonly output_tokens: number;
}

export interface IrTextBlock {
  readonly kind: number;
  readonly text: string;
}

export interface IrRequest {
  readonly model?: string | null;
  readonly stream?: number;
}

export interface IrResponse {
  readonly id: string;
  readonly model: string;
  readonly stop_reason: string;
  readonly content: readonly IrTextBlock[];
  readonly usage: IrUsage;
}

export interface IrEvent {
  readonly kind: number;
  readonly id?: string;
  readonly model?: string;
  readonly role?: string;
  readonly usage?: IrUsage;
  readonly index?: number;
  readonly block_kind?: number;
  readonly text?: string;
  readonly stop_reason?: string;
}

export interface IrFailure {
  readonly status: number;
  readonly headers: readonly Pair[];
  readonly body: string;
  readonly has_retry_after?: number;
  readonly retry_after_milliseconds?: number;
}

export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly has_context: number;
  readonly context: number;
  readonly has_output: number;
  readonly output: number;
}

export interface CatalogProvider {
  readonly provider: string;
  readonly models: readonly CatalogModel[];
  readonly has_ranking: number;
  readonly default_model: string;
}

/** A stream this plugin hands back, read by `next` one event at a time. */
export interface Stream {
  readonly events: IrEvent[];
}

export type HandleAnswer =
  | { readonly kind: 1; readonly response: IrResponse }
  | { readonly kind: 2; readonly failure: IrFailure }
  | { readonly kind: 3; readonly stream: Stream }
  | { readonly kind: 4; readonly message: string };

export type NextAnswer = { readonly kind: 1; readonly event: IrEvent } | { readonly kind: 2 };

export interface HandleArgument {
  readonly request: IrRequest;
  readonly headers: readonly Pair[];
  readonly token: bigint;
}

/** The `forebay.provider` contract as this plugin offers it, in the binding's shapes. */
export interface Provider {
  models(input: Record<string, never>): Promise<{ provider: CatalogProvider }>;
  handle(input: { argument: HandleArgument }): Promise<HandleAnswer>;
  next(input: { stream: Stream }): Promise<NextAnswer>;
  cancel(input: { argument: { token: bigint } }): Promise<void>;
}

export interface StoredAccount {
  readonly id: string;
  readonly enabled?: boolean;
}

export interface AcquireAnswer {
  readonly kind: number;
  readonly id?: string;
  readonly available: number;
  readonly knows_available_at: number;
  readonly available_at: number;
}

export interface ReportArgument {
  readonly store: string;
  readonly id: string;
  readonly outcome: number;
  readonly now: number;
  readonly has_random: number;
  readonly random: number;
  readonly base_milliseconds: number;
  readonly max_milliseconds: number;
}

/** forebay-library's `accounts` service, the operations this plugin calls. */
export interface Accounts {
  list(input: { argument: { store: string } }): Promise<{ accounts: readonly StoredAccount[] }>;
  upsert(input: { argument: { store: string; account: Record<string, unknown> } }): Promise<{ outcome: number }>;
  acquire(input: { argument: { store: string; strategy: number; now: number } }): Promise<AcquireAnswer>;
  report(input: { argument: ReportArgument }): Promise<{ changed: number }>;
}

export interface Config {
  get_tree(input: { key: string }): Promise<unknown>;
}

export interface Paths {
  plugin(input: Record<string, never>): Promise<string>;
}

export interface Log {
  write(input: { level: number; message: string }): Promise<void>;
}

export const HANDLE = { RESPONSE: 1, FAILURE: 2, STREAM: 3, THROWN: 4 } as const;

export const NEXT = { EVENT: 1, END: 2 } as const;

export const IR_BLOCK_TEXT = 1;

export const IR_EVENT = { MESSAGE_START: 1, CONTENT_BLOCK_START: 2, TEXT_DELTA: 3, CONTENT_BLOCK_STOP: 7, MESSAGE_DELTA: 8, MESSAGE_STOP: 9 } as const;

export const ACQUIRE = { CLAIMED: 1, NONE: 2 } as const;

export const STRATEGY = { STICKY: 1, ROUND_ROBIN: 2, HYBRID: 3 } as const;

export const REPORT_OUTCOME = { SUCCESS: 1, ERROR: 3 } as const;

export const WEIVEL_LOG = { INFO: 3, WARN: 4 } as const;
