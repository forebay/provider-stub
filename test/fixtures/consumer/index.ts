interface Context {
  service(id: string): unknown;
  capability(id: string): unknown;
  readonly capabilities: { all(capability: unknown): unknown[] };
  readonly services: { register(service: unknown, object: object): unknown };
}

interface Provider {
  models(input: Record<string, never>): Promise<unknown>;
  handle(input: { argument: unknown }): Promise<unknown>;
  next(input: { stream: unknown }): Promise<unknown>;
  cancel(input: { argument: { token: bigint } }): Promise<unknown>;
}

/**
 * A plugin consuming `forebay.provider` that hands the test every call of the contract through the service
 * `consumer:calls`, so the test calls the stub as a proxy does, through the capability the host verified.
 */
export default {
  activate(context: Context): void {
    const providers = (): Provider[] => context.capabilities.all(context.capability("forebay.provider")) as Provider[];
    const only = (): Provider => {
      const all = providers();
      if (all.length !== 1) throw new Error(`the consumer reaches ${all.length} providers, not one`);
      return all[0]!;
    };
    context.services.register(context.service("consumer:calls"), {
      count: () => providers().length,
      models: () => only().models({}),
      handle: (argument: unknown) => only().handle({ argument }),
      next: (stream: unknown) => only().next({ stream }),
      cancel: (token: bigint) => only().cancel({ argument: { token } }),
    });
  },
};
