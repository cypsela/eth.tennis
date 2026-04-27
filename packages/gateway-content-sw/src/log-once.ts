const warned = new Set<string>();

export function logOnce(key: string, err?: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[@cypsela/gateway-content-sw] ${key}`, err);
}

/** Test-only reset hook; do not call from production code. */
export function _resetLogOnceForTests(): void {
  warned.clear();
}
