/**
 * Fixed-window request counter per key (client IP, or token hash), in memory.
 * Bounded: the oldest windows are dropped past `maxKeys`.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts a request; returns the seconds to wait when over the limit, else 0. */
  hit(key: string, now = Date.now()): number {
    const window = this.windows.get(key)
    if (!window || now - window.start >= this.windowMs) {
      this.windows.delete(key)
      if (this.windows.size >= this.maxKeys) {
        const oldest = this.windows.keys().next().value
        if (oldest !== undefined) this.windows.delete(oldest)
      }
      this.windows.set(key, { start: now, count: 1 })
      return 0
    }
    window.count += 1
    if (window.count <= this.limit) return 0
    return Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000))
  }
}
