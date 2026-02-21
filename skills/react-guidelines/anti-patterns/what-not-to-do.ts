/**
 * ANTI-PATTERNS — What NOT to do
 * This file consolidates all BAD patterns for quick reference during code review.
 * Each section links to the GOOD patterns in examples/.
 */

// ─────────────────────────────────────────────
// [1] MUTATION — examples/typescript/immutability.ts
// ─────────────────────────────────────────────

const user = { name: "Alice", role: "user" };
const items = ["a", "b", "c"];

user.name = "Bob";          // ❌ mutates object
items.push("d");            // ❌ mutates array
items.sort();               // ❌ sorts in place
items.splice(0, 1);         // ❌ removes in place

// ─────────────────────────────────────────────
// [2] TYPE SAFETY — examples/typescript/type-safety.ts
// ─────────────────────────────────────────────

// ❌ Using `any`
const getDataBad = async (id: any): Promise<any> =>
  fetch(`/api/${id}`).then(r => r.json());

// ❌ Non-null assertion lying to TypeScript
declare const maybeUser: { address?: { city?: string } } | null;
const city = maybeUser!.address!.city!; // throws at runtime if any is null

// ─────────────────────────────────────────────
// [3] ERROR HANDLING — examples/typescript/error-handling.ts
// ─────────────────────────────────────────────

// ❌ No error handling
const fetchBad = async (url: string) => {
  const r = await fetch(url);
  return r.json(); // can throw, status not checked
};

// ❌ Silent swallow
const silentFail = async () => {
  try {
    await fetchBad("/api/data");
  } catch (_: unknown) {
    // 🚫 Error lost forever — impossible to debug
  }
};

// ❌ Catching but not rethrowing when caller needs to know
const halfBaked = async () => {
  try {
    return await fetchBad("/api/data");
  } catch (e: unknown) {
    console.error(e); // logged but still swallowed — caller thinks success
  }
};

// ─────────────────────────────────────────────
// [4] ASYNC — examples/typescript/async-patterns.ts
// ─────────────────────────────────────────────

// ❌ Sequential awaits for independent operations
const loadSlowly = async (userId: string) => {
  const user = await fetch(`/api/users/${userId}`);    // 300ms
  const posts = await fetch(`/api/posts/${userId}`);   // +300ms
  const stats = await fetch(`/api/stats/${userId}`);   // +300ms = 900ms total
};

// ❌ Promise.all with no limit on large arrays
const bombApi = async (ids: string[]) =>
  Promise.all(ids.map(id => fetch(`/api/${id}`))); // 10k concurrent requests

// ─────────────────────────────────────────────
// [5] NAMING — examples/typescript/naming.ts
// ─────────────────────────────────────────────

const q = "search term";     // ❌ unclear
const flag = true;           // ❌ meaningless
const x = 1800000;           // ❌ magic number
const arr: unknown[] = [];   // ❌ what is in this array?

const process = async (d: any) => {};   // ❌ what does it process?
const check = (x: any): boolean => true; // ❌ check what?
const data = async (id: string) => {};  // ❌ noun-only, not a verb

// ─────────────────────────────────────────────
// [6] REACT — examples/react/
// ─────────────────────────────────────────────

// ❌ Stale closure in state update
declare function setCount(n: number | ((prev: number) => number)): void;
declare const count: number;
const incrementBad = () => setCount(count + 1); // `count` may be stale

// ❌ Derived state stored in separate useState (sync issues)
declare const selectedItems: string[];
// const [selectedCount, setSelectedCount] = useState(0); // will drift from selectedItems

// ❌ Ternary hell (unreadable conditional rendering)
declare const isLoading: boolean, error: Error | null, data: string[] | null;
const renderBad = isLoading ? "loading" : error ? error.message : data ? data.join() : null;

// ❌ No cleanup in useEffect (memory leak / stale state)
// useEffect(() => {
//   fetch('/api/data').then(r => r.json()).then(setData); // No cancel on unmount
// }, []);

// ─────────────────────────────────────────────
// [7] FUNCTION SIZE
// ─────────────────────────────────────────────

// ❌ God function — does everything
const handleFormSubmit = async (formData: Record<string, string>) => {
  // Validate inputs (20 lines)
  // Format data (15 lines)
  // Call API (10 lines)
  // Handle response (15 lines)
  // Update local state (10 lines)
  // Show notifications (10 lines)
  // Redirect user (5 lines)
  // = 85 lines doing 7 things → split into focused functions
};

// ─────────────────────────────────────────────
// [8] NESTING
// ─────────────────────────────────────────────

// ❌ Deep nesting (5+ levels)
const processDeep = (user: any, market: any) => {
  if (user) {
    if (user.isVerified) {
      if (market) {
        if (market.isActive) {
          if (user.balance > market.minimumBet) {
            // Finally doing something — 5 levels deep
          }
        }
      }
    }
  }
};

// ✅ GOOD — early returns flatten the structure (destructuring when >1 param)
interface ProcessCleanArgs {
  user: any;
  market: any;
}
const processClean = ({ user, market }: ProcessCleanArgs) => {
  if (!user?.isVerified) return;
  if (!market?.isActive) return;
  if (user.balance <= market.minimumBet) return;
  // Do something — 0 nesting
};

// ─────────────────────────────────────────────
// [9] CONSOLE LOGS IN PRODUCTION CODE
// ─────────────────────────────────────────────

// ❌ Debug logs left in
const fetchUserBad = async (id: string) => {
  console.log("fetchUser called with", id); // ❌ leaks to production
  const user = await fetch(`/api/users/${id}`);
  console.log("user response", user);        // ❌ may log sensitive data
  return user.json();
};

// ─────────────────────────────────────────────
// [10] MAGIC NUMBERS & STRINGS
// ─────────────────────────────────────────────

// ❌ Inline magic values
if (retryCount > 3) {}           // What is 3?
setTimeout(fn, 1800000);         // What is 1800000?
if (role === "admin_v2") {}      // Why v2? Is there v1?

// ✅ GOOD
const MAX_RETRIES = 3;
const SESSION_TIMEOUT_MS = 30 * PeriodsInMS.oneMinute; // 30 minutes self-explanatory
const ADMIN_ROLE = "admin_v2" as const;

declare const retryCount: number;
declare function fn(): void;
declare const role: string;
