/** Token bucket rate limiter (in-process; resets on restart) */

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillMs: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(cost = 1): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= cost) {
        this.tokens -= cost;
        return;
      }
      const wait = Math.max(10, this.refillMs / this.maxTokens);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillMs) {
      const periods = Math.floor(elapsed / this.refillMs);
      this.tokens = Math.min(this.maxTokens, this.tokens + periods * this.maxTokens);
      this.lastRefill += periods * this.refillMs;
    }
  }
}

/** AniList: ~90/min with token → 1 request per ~667ms average; use 15 tokens / 10s bucket */
export const anilistLimiter = new RateLimiter(15, 10_000);

/** Jikan: 3/sec → bucket 3 tokens / 1s */
export const jikanLimiter = new RateLimiter(3, 1_000);
