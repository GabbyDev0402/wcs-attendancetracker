export const DEFAULT_TTL_MS = 3 * 60 * 1000;

const cacheStore = new Map();
const inflightStore = new Map();

/**
 * Execute and cache an async Firestore read with TTL + concurrent in-flight deduplication.
 */
export async function cachedQuery(
  key,
  fetcher,
  { ttlMs = DEFAULT_TTL_MS, forceRefresh = false } = {}
) {
  if (!key) {
    return await fetcher();
  }

  const now = Date.now();
  if (!forceRefresh) {
    const cached = cacheStore.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    if (inflightStore.has(key)) {
      return inflightStore.get(key);
    }
  } else {
    cacheStore.delete(key);
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      cacheStore.set(key, {
        data,
        expiresAt: Date.now() + Math.max(0, ttlMs)
      });
      return data;
    } finally {
      inflightStore.delete(key);
    }
  })();

  inflightStore.set(key, promise);
  return promise;
}

/**
 * Invalidate an exact cache key or all keys sharing a prefix.
 */
export function invalidateCache(prefixOrKey) {
  if (!prefixOrKey) return;
  for (const key of cacheStore.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      cacheStore.delete(key);
    }
  }
  for (const key of inflightStore.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      inflightStore.delete(key);
    }
  }
}

/**
 * Clear all cached Firestore reads (called on logout / auth reset).
 */
export function clearFirestoreCache() {
  cacheStore.clear();
  inflightStore.clear();
}
