// Session-scoped stale-while-revalidate cache for GET responses.
// Views seed their state from here so switching tabs or months renders the
// last-known data instantly while a background refetch updates it.
const cache = new Map();

export function readCache(key) {
  return cache.get(key);
}

export function writeCache(key, value) {
  cache.set(key, value);
}

export function clearApiCache() {
  cache.clear();
}
