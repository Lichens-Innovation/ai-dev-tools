/**
 * ASYNC / PROMISE PATTERNS
 * Rule: Prefer parallel execution. Never await sequentially when operations are independent.
 */

// ─────────────────────────────────────────────
// PARALLEL vs SEQUENTIAL
// ─────────────────────────────────────────────

// ✅ GOOD — parallel execution (~300ms if each takes 300ms)
const loadDashboard = async (userId: string) => {
  const [user, markets, stats] = await Promise.all([
    fetchUser(userId),
    fetchMarkets(userId),
    fetchStats(userId),
  ]);
  return { user, markets, stats };
};

// ❌ BAD — sequential when not needed (~900ms for same result)
async function loadDashboardSlow(userId: string) {
  const user = await fetchUser(userId);       // wait 300ms
  const markets = await fetchMarkets(userId); // wait 300ms more
  const stats = await fetchStats(userId);     // wait 300ms more
  return { user, markets, stats };
}

// ─────────────────────────────────────────────
// PROMISE.ALLSETTLED — when failures are acceptable
// ─────────────────────────────────────────────

// ✅ GOOD — continues even if some fail
const loadOptionalWidgets = async (userId: string) => {
  const results = await Promise.allSettled([
    fetchRecommendations(userId),
    fetchNotifications(userId),
    fetchAnnouncements(),
  ]);

  return results.map((result) =>
    result.status === "fulfilled" ? result.value : null
  );
};

// ─────────────────────────────────────────────
// SEQUENTIAL when order/dependency matters
// ─────────────────────────────────────────────

// ✅ GOOD — sequential here because step 2 depends on step 1
const createAndNotify = async (data: MarketData) => {
  const market = await createMarket(data);       // Must exist first
  await notifySubscribers(market.id);            // Depends on market.id
  return market;
};

// ─────────────────────────────────────────────
// TIMEOUT PATTERN
// ─────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 5000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
};

// ✅ GOOD — never hang indefinitely
const fetchWithTimeout = async (url: string) => {
  return withTimeout(fetch(url), REQUEST_TIMEOUT_MS);
};

// ─────────────────────────────────────────────
// RETRY PATTERN
// ─────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return withRetry(fn, retries - 1);
  }
};

// Usage
const fetchReliable = async (url: string) => {
  return withRetry(() => fetch(url).then((r) => r.json()));
};

// ─────────────────────────────────────────────
// ASYNC ITERATION — avoid holding all in memory
// ─────────────────────────────────────────────

// ✅ GOOD — process in batches
const processLargeList = async (ids: string[]) => {
  const BATCH_SIZE = 10;
  const results: unknown[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(processItem));
    results.push(...batchResults);
  }

  return results;
};

// ❌ BAD — may exhaust API rate limits or memory
async function processLargeListBad(ids: string[]) {
  return Promise.all(ids.map(processItem)); // 10,000 concurrent requests!
}

// Stubs
interface MarketData { name: string; }
const fetchUser = async (id: string) => ({ id });
const fetchMarkets = async (id: string) => [];
const fetchStats = async (id: string) => ({});
const fetchRecommendations = async (id: string) => [];
const fetchNotifications = async (id: string) => [];
const fetchAnnouncements = async () => [];
const createMarket = async (data: MarketData) => ({ id: "1", ...data });
const notifySubscribers = async (id: string) => {};
const processItem = async (id: string) => ({ id });
