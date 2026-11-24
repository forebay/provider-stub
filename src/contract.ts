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

/** What `handle` answers: a forebay_provider_handle_kind, and the member that kind carries. */
export interface HandleAnswer {
  readonly kind: number;
  readonly response?: IrResponse;
  readonly failure?: IrFailure;
  readonly stream?: Stream;
  readonly message?: string;
}

/** What `next` answers: a forebay_provider_next_kind, and the event an EVENT carries. */
export interface NextAnswer {
  readonly kind: number;
  readonly event?: IrEvent;
}

/** A call's token; a uint64 out of C may arrive as a number or as a bigint. */
export type Token = bigint | number;

export interface HandleArgument {
  readonly request: IrRequest;
  readonly headers: readonly Pair[];
  readonly token: Token;
}

/** The `forebay.provider` contract as this plugin offers it, in the binding's shapes. */
export interface Provider {
  models(input: Record<string, never>): Promise<{ provider: CatalogProvider }>;
  handle(input: { argument: HandleArgument }): Promise<HandleAnswer>;
  next(input: { stream: Stream }): Promise<NextAnswer>;
  cancel(input: { argument: { token: Token } }): Promise<void>;
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

/** Bytes C wrote and the reply they go out in. */
export interface Body {
  readonly bytes: Uint8Array;
  readonly status: number;
  readonly headers: readonly Pair[];
}

/** forebay-library's `anthropic` service, the operation this plugin calls. */
export interface Anthropic {
  error_envelope(input: { argument: { reply_kind: number; message: string } }): Promise<Body>;
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

type Entries<Name extends string> = Readonly<Record<Name, number>>;

/**
 * The enums this plugin reads, by the names forebay-library's and the standard's headers spell them. Only the names
 * are written here: the numbers are the descriptions', which the plugin's context answers.
 */
export interface ProviderEnums {
  readonly forebay_provider_handle_kind: Entries<"FOREBAY_PROVIDER_HANDLE_RESPONSE" | "FOREBAY_PROVIDER_HANDLE_FAILURE" | "FOREBAY_PROVIDER_HANDLE_STREAM" | "FOREBAY_PROVIDER_HANDLE_THROWN">;
  readonly forebay_provider_next_kind: Entries<"FOREBAY_PROVIDER_NEXT_EVENT" | "FOREBAY_PROVIDER_NEXT_END">;
  readonly forebay_ir_block_kind: Entries<"FOREBAY_IR_BLOCK_TEXT">;
  readonly forebay_ir_event_kind: Entries<
    | "FOREBAY_IR_EVENT_MESSAGE_START"
    | "FOREBAY_IR_EVENT_CONTENT_BLOCK_START"
    | "FOREBAY_IR_EVENT_TEXT_DELTA"
    | "FOREBAY_IR_EVENT_CONTENT_BLOCK_STOP"
    | "FOREBAY_IR_EVENT_MESSAGE_DELTA"
    | "FOREBAY_IR_EVENT_MESSAGE_STOP"
  >;
}

export interface AnthropicEnums {
  readonly forebay_reply_kind: Entries<"FOREBAY_REPLY_PROVIDER_FAILURE">;
}

export interface AccountsEnums {
  readonly forebay_accounts_acquire_kind: Entries<"FOREBAY_ACCOUNTS_CLAIMED">;
  readonly forebay_accounts_strategy: Entries<"FOREBAY_ACCOUNTS_STICKY" | "FOREBAY_ACCOUNTS_ROUND_ROBIN" | "FOREBAY_ACCOUNTS_HYBRID">;
  readonly forebay_accounts_report_outcome: Entries<"FOREBAY_ACCOUNTS_SUCCESS" | "FOREBAY_ACCOUNTS_ERROR">;
}

export interface LogEnums {
  readonly weivel_standard_log_level: Entries<"WEIVEL_STANDARD_LOG_INFO" | "WEIVEL_STANDARD_LOG_WARN">;
}

/** Each enum by the definition or contract whose description carries it. */
export interface Enums {
  readonly provider: ProviderEnums;
  readonly anthropic: AnthropicEnums;
  readonly accounts: AccountsEnums;
  readonly log: LogEnums;
}
