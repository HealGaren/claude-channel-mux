function isEnabled(): boolean {
  return process.env.CHANNEL_MUX_DEBUG === '1' || process.env.CHANNEL_MUX_DEBUG === 'true'
}

type DebugFn = {
  (...args: unknown[]): void
  readonly enabled: boolean
}

export function createDebug(prefix: string): DebugFn {
  const fn = (...args: unknown[]) => {
    if (!isEnabled()) return
    const ts = new Date().toISOString()
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    process.stderr.write(`[${ts}] ${prefix}: ${msg}\n`)
  }
  Object.defineProperty(fn, 'enabled', { get: isEnabled })
  return fn as DebugFn
}
