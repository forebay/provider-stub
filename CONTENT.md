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

## Start from this template

This repository is a GitHub template: a new provider starts as a copy of it. It is also a test fixture that other
repos run against, so the stub itself keeps every name below; only the copy renames them.

Rename every identifier that says `provider-stub` or `stub`:

- `package.json`: `name`, `repository.url`, `keywords`.
- `plugin.json`: `importName`, `id`, `displayName`, `services.provides`, the `actions.*.call.service` values, the
  `response_text` default and the `repo` block.
- `repo.json`: `importName`, `description`, `topics`.
- `.github/docs-config.yml`: `description`. `.github/workflows/release.yml`: `unscoped_name`.
- `src/plugin.ts`: `ACTIONS_SERVICE` and the `reaches no ... service` error text.
- `src/models.ts`: `PROVIDER_NAME`, `DEFAULT_MODEL_ID`, `NAMED_MODELS` and the `stub-<n>` name `modelAt` falls back to.
- `src/provider.ts`: `CANCELLED_MESSAGE`, `ALL_COOLING_MESSAGE`, `NO_ACCOUNT_MESSAGE`, and the inline texts
  `Stub overloaded (fail_rate)`, `could not report how a request ... went` and `could not serve the request`.
- `src/settings.ts`: the `setting of provider-stub must be ...` error texts.
- `src/replies.ts`: `CANNED_MESSAGE_ID` (`msg_stub_0001`) and `BLANK_RESPONSE_TEXT`.
- `src/account-actions.ts`: the `stub-<n>@example.com` account names and the service named in its doc comment.
- `stubProvider`, `stubCatalog` and `StubSettings`, and the names and expected texts in `test/`.

The fixture knobs exist so other repos can make the stub misbehave on purpose. **Delete them for a real provider**:
`fail_rate`, `latency_ms`, `model_count`, `streaming` and `response_text`, in `plugin.json`'s defaults,
`src/settings.ts` and the code in `src/provider.ts`, `src/models.ts` and `src/replies.ts` that reads them. A real
provider replaces the canned replies with calls to its upstream, and `login` with its own sign-in.

`src/contract.ts` is written by hand: its shapes are what weivel/typescript's binding gives forebay-library's
definitions, so they must track the `forebay-library` commit `repo.json` pins, and a pin bump re-reads them.

A provider that is not served through a proxy drops `test/through-the-proxy.test.ts` and the `claude-code-proxy` pin
in `repo.json`.
