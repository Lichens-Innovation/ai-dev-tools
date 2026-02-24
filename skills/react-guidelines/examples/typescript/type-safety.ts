/**
 * TYPE SAFETY — TypeScript
 * Rule: NEVER use `any`. Define precise interfaces and use union types.
 *       Do NOT define types inline — extract to named types (DRY, reuse).
 *       Do NOT nest type definitions — extract nested object shapes to named types (reuse, clarity).
 */
export {};

// ─────────────────────────────────────────────
// INTERFACES vs `any` — named types, no inline
// ─────────────────────────────────────────────

type MarketStatus = "active" | "resolved" | "closed";

interface Market {
  id: string;
  name: string;
  description: string;
  status: MarketStatus;
  createdAt: Date;
  resolvedAt?: Date; // optional field
}

const getMarket = async (id: string): Promise<Market> => {
  const data = await fetch(`/api/markets/${id}`).then((r) => r.json());
  return data as Market; // validated by API contract
};

// ❌ BAD — `any` defeats the entire purpose of TypeScript
const getMarketBad = async (id: any): Promise<any> => fetch(`/api/markets/${id}`).then((r) => r.json());

// ─────────────────────────────────────────────
// UNION TYPES — prefer over loose strings
// ─────────────────────────────────────────────

// ✅ GOOD
type UserRole = "admin" | "moderator" | "user" | "guest";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type SortDirection = "asc" | "desc";

interface SortMarketsArgs {
  markets: Market[];
  direction: SortDirection;
}
const sortMarkets = ({ markets, direction }: SortMarketsArgs): Market[] => {
  if (direction === "asc") {
    return [...markets].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...markets].sort((a, b) => b.name.localeCompare(a.name));
};

// ❌ BAD — no autocomplete, no safety, not using early returns
const sortMarketsBad = (markets: any[], direction: string): any[] =>
  markets.sort((a, b) => (direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));

// ─────────────────────────────────────────────
// GENERICS — reusable typed utilities
// ─────────────────────────────────────────────

// ✅ GOOD — typed API response wrapper (meta extracted to named type)
interface ApiResponseMeta {
  total: number;
  page: number;
  limit: number;
}
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: ApiResponseMeta;
}

const apiFetch = async <T>(url: string): Promise<ApiResponse<T>> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (error: unknown) {
    return { success: false, error: String(error) };
  }
};

// Usage — TypeScript infers the type
const result = await apiFetch<Market[]>("/api/markets");
if (result.success && result.data) {
  result.data.forEach((market) => console.log(market.name)); // ✅ fully typed
}

// ─────────────────────────────────────────────
// UNKNOWN vs ANY — for truly unknown inputs
// ─────────────────────────────────────────────

// ✅ GOOD — `unknown` forces you to check before use
const parseConfig = (input: unknown): Record<string, string> => {
  if (typeof input !== "object" || input === null) {
    throw new Error("Config must be an object");
  }
  return input as Record<string, string>;
};

// ❌ BAD — `any` skips all checks
const parseConfigBad = (input: any) => input; // could be anything, TypeScript won't complain

// ─────────────────────────────────────────────
// NO NESTED TYPES — extract nested shapes to named types
// ─────────────────────────────────────────────
// Rule: Do not define object types inline inside another interface.
//       Extract them to named types for reuse, clarity, and single source of truth.

interface UserAddress {
  city?: string;
  country?: string;
}

interface UserProfile {
  id: string;
  name: string;
  address?: UserAddress;
}

// ❌ BAD — nested inline type (not reusable, harder to read)
interface UserProfileBad {
  id: string;
  name: string;
  address?: {
    city?: string;
    country?: string;
  };
}

// ─────────────────────────────────────────────
// OPTIONAL CHAINING & NULLISH COALESCING
// ─────────────────────────────────────────────
// Rule: Prefer ?? (nullish coalescing) over || for null/undefined.
// || treats 0, "", false as falsy and replaces them; ?? only replaces null and undefined.

// ✅ GOOD — safe access; ?? for null/undefined default only
const getUserCity = (user: UserProfile): string => user.address?.city ?? "Unknown city";
// Example: const pageSize = config.pageSize ?? 10; // 0 would be kept with ??, replaced with ||
// Example: const label = status?.description ?? "-";

// ❌ BAD — || replaces 0, "", false too (often unintended)
// const pageSize = config.pageSize || 10;   // 0 becomes 10
// const label = status?.description || "-"; // "" becomes "-"

// ❌ BAD — will throw if address is undefined
const getUserCityBad = (user: UserProfile): string => user.address!.city!; // non-null assertion = lying to TypeScript

// ─────────────────────────────────────────────
// RECORD<K, V> — prefer over custom index signature
// ─────────────────────────────────────────────

// ✅ GOOD — Record is concise and works well with Partial, Pick, etc.
type ViewedItems = Record<string, Date>;
type Status = "pending" | "completed" | "failed";
type TaskStatuses = Record<Status, Date>;

// ❌ BAD — custom index signature is verbose
// type ViewedItemsBad = { [key: string]: Date };

// ─────────────────────────────────────────────
// OPTIONAL PARAMETERS — use param?: Type, not param: Type | undefined
// ─────────────────────────────────────────────

// ✅ GOOD — optional param syntax is clear and concise
const greet = (name?: string): string => (name ? `Hello, ${name}!` : "Hello!");

// ❌ BAD — param: Type | undefined is verbose
// const greetBad = (name: string | undefined): string => ...

// ─────────────────────────────────────────────
// ENUMS — use explicit numeric (or string) values for stability
// ─────────────────────────────────────────────
// Implicit ordinal enums can change when members are reordered; explicit values survive serialization.

// ✅ GOOD — explicit values; stable across refactors and serialization
enum UserRole {
  Admin = 1,
  User = 2,
  Guest = 3,
}

// ❌ BAD — implicit ordinal (0, 1, 2); reordering breaks stored values
// enum UserRoleBad { Admin, User, Guest }

// ─────────────────────────────────────────────
// TODO COMMENTS — add ticket ID for traceability
// ─────────────────────────────────────────────
// Prefer: // TODO: JIRA-1234 - description

// ✅ GOOD
// const contentType = ""; // TODO: JIRA-1234 - Determine the appropriate content type

// ❌ BAD — no reference to track or assign
// const contentType = ""; // TODO
