interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  async check(
    key: string
  ): Promise<{ success: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        success: true,
        remaining: this.maxAttempts - 1,
        resetAt: now + this.windowMs,
      };
    }

    if (entry.count >= this.maxAttempts) {
      return { success: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return {
      success: true,
      remaining: this.maxAttempts - entry.count,
      resetAt: entry.resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const maxAttempts = Number(process.env.AUTH_RATE_LIMIT_MAX) || 5;
export const loginRateLimiter = new RateLimiter(maxAttempts, 15 * 60 * 1000);
