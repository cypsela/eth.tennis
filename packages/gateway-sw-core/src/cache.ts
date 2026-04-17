export interface SwrCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  getOrLoad(key: K, load: () => Promise<V>): Promise<V>;
  clear(): void;
}

export interface SwrCacheOpts {
  ttlMs: number;
  now?: () => number;
}

interface Entry<V> {
  value: V;
  fetchedAt: number;
}

export function createSwrCache<K, V>(opts: SwrCacheOpts): SwrCache<K, V> {
  const now = opts.now ?? (() => Date.now());
  const store = new Map<K, Entry<V>>();
  const inflight = new Map<K, Promise<V>>();

  function isFresh(entry: Entry<V>): boolean {
    return now() - entry.fetchedAt < opts.ttlMs;
  }

  return {
    get(key) {
      return store.get(key)?.value;
    },
    set(key, value) {
      store.set(key, { value, fetchedAt: now() });
    },
    async getOrLoad(key, load) {
      const entry = store.get(key);
      if (entry && isFresh(entry)) return entry.value;

      if (!inflight.has(key)) {
        const p = load()
          .then((v) => {
            store.set(key, { value: v, fetchedAt: now() });
            return v;
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, p);
        if (entry) {
          return entry.value;
        }
        return p;
      }
      if (entry) return entry.value;
      return inflight.get(key)!;
    },
    clear() {
      store.clear();
      inflight.clear();
    },
  };
}
