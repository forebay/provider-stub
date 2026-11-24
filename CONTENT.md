A fake AI provider, the reference example of a provider plugin. It is a weivel plugin that provides
forebay-library's `forebay.provider` contract and answers every request with a canned reply, so the account,
routing and fallback pipeline can be proven end to end without reaching any real upstream.

## Structure

- `src/plugin.ts`: provides `forebay.provider` and registers the `provider-stub:accounts` service the `login` and
  `accounts` actions call.
- `src/provider.ts`: the contract. `models` offers the stub models only while the store holds an enabled account;
  `handle` claims an account through the `accounts` service, rolls `fail_rate`, waits `latency_ms` and answers the
  canned reply or its six stream events. No account that can serve, or every account cooling, is a 503 whose body
  the `anthropic` service's `error_envelope` writes, saying when to retry where that is known; only `fail_rate`'s
  529 is written here, as the upstream's `overloaded_error`. A setting or an acquire that fails answers THROWN with
  its message. `cancel` ends the call its token names, and a token it does not know does nothing.
- `src/cancellations.ts`: the calls running now, by token, and the wait a cancellation ends.
- `src/account-actions.ts`: `login` adds `stub-<n>@example.com`; `accounts` lists them. The store is `accounts.json`
  in the directory `weivel.paths` gives the plugin.
- `src/contract.ts`, `src/models.ts`, `src/replies.ts`, `src/settings.ts`: the binding's shapes, the model list, the
  replies and the settings, read through `weivel.config`.

## Testing

`npm test` builds `forebay-library` and `runtime` from `siblings/` (`scripts/native.ts`), builds, type-checks and
runs vitest. Every test bundles the plugin and starts the real `runtime` over a temporary home with
`@weivel/typescript`'s host program: `test/stub.test.ts` calls the contract through a consumer plugin and runs the
actions through the program's ACTION mode; `test/through-the-proxy.test.ts` puts the stub behind the pinned
`claude-code-proxy` and sends it real HTTP requests.
