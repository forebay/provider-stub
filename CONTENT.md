A fake AI provider for the shared host. It is a weivel plugin that provides the `provider` capability and
answers every request with a canned reply, so the account, routing and fallback pipeline can be proven end to
end without reaching any real upstream.

## Structure

- `src/plugin.ts`: provides the capability and registers the `provider-stub:accounts` service the actions call.
- `src/handle-ir.ts`: picks an account through the host's `accounts` service, rolls `fail_rate`, waits `latency_ms`
  and answers the canned reply, or the six stream events when streaming applies.
- `src/login-action.ts`: the `login` action adds `stub-<n>@example.com` and keeps its token in the plugin's secrets;
  the `accounts` action lists them.
- `src/models.ts`, `src/stub-stream.ts`, `src/canned-reply.ts`, `src/settings.ts`: the model list, the stream, the reply and the settings.

## Testing

`npm test` builds, type-checks and runs vitest. The tests use the real `accounts` service of a built
`forebay-library`, and the plugin is bundled with the host's `bundlePlugin` and run from the bundle alone.
