export interface GatewayLimits {
  /** Requests allowed in flight at once. */
  maxConcurrent: number;
  /** Requests allowed back to back before `perSecond` applies. */
  burst?: number;
  /** Sustained request rate once the burst is spent. */
  perSecond?: number;
}

export interface GatewayLimiter {
  /** True when a task started now would run without waiting. */
  hasCapacity(): boolean;
  /** Runs `fn` once a slot (and, if rate limited, a token) is free. */
  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/**
 * Shapes requests to one gateway: a concurrency cap, plus an optional token
 * bucket (`burst` tokens, refilled at `perSecond`) for gateways that rate
 * limit by request count.
 */
export function createGatewayLimiter(limits: GatewayLimits): GatewayLimiter {
  const rate = limits.perSecond;
  const burst = limits.burst ?? (rate != null ? 1 : Infinity);
  let tokens = burst;
  let refilledAt = Date.now();
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiters: Array<() => void> = [];

  function refill(): void {
    if (rate == null) return;
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - refilledAt) / 1000) * rate);
    refilledAt = now;
  }

  function pump(): void {
    refill();
    while (waiters.length > 0 && active < limits.maxConcurrent && tokens >= 1) {
      tokens -= 1;
      active += 1;
      waiters.shift()!();
    }
    const starved = waiters.length > 0 && active < limits.maxConcurrent;
    if (starved && rate != null && timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        pump();
      }, Math.ceil(((1 - tokens) / rate) * 1000));
    }
  }

  function acquire(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const grant = (): void => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = (): void => {
        const i = waiters.indexOf(grant);
        if (i >= 0) waiters.splice(i, 1);
        reject(signal!.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiters.push(grant);
      pump();
    });
  }

  return {
    hasCapacity() {
      refill();
      return waiters.length === 0
        && active < limits.maxConcurrent
        && tokens >= 1;
    },
    async run(fn, signal) {
      await acquire(signal);
      try {
        return await fn();
      } finally {
        active -= 1;
        pump();
      }
    },
  };
}
