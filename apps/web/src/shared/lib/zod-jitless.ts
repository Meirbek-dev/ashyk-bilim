/**
 * Zod 4 (through @ag-ui/client) probes `Function('')` on its first object parse; CSP has no 'unsafe-eval', so the
 * probe reports a violation. Its global config (one object on `globalThis`, read at that first parse) turns the JIT
 * off: call this before any parse, whether Zod has loaded yet or not.
 */
export function disableZodJit(): void {
  const config: unknown = Reflect.get(globalThis, '__zod_globalConfig')
  if (typeof config === 'object' && config !== null) Reflect.set(config, 'jitless', true)
  else Reflect.set(globalThis, '__zod_globalConfig', { jitless: true })
}
