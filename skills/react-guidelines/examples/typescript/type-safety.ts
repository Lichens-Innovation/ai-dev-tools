/**
 * TYPE SAFETY — TypeScript
 * Rule: NEVER use `any`. Define precise interfaces and use union types.
 */
export {};

// ─────────────────────────────────────────────
// INTERFACES vs `any`
// ─────────────────────────────────────────────

// ✅ GOOD — explicit shape
interface Market {
  id: string;
  name: string;
  description: string;
  status: "active" | "resolved" | "closed";
  createdAt: Date;
  resolvedAt?: Date; // optional field
}

const getMarket = async (id: string): Promise<Market> => {
  const data = await fetch(`/api/markets/${id}`).then((r) => r.json());
  return data as Market; // validated by API contract
};

// ❌ BAD — `any` defeats the entire purpose of TypeScript
const getMarketBad = async (id: any): Promise<any> =>
  fetch(`/api/markets/${id}`).then((r) => r.json());

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
const sortMarkets = ({ markets, direction }: SortMarketsArgs): Market[] =>
  [...markets].sort((a, b) =>
    direction === "asc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)
  );

// ❌ BAD — no autocomplete, no safety
const sortMarketsBad = (markets: any[], direction: string): any[] =>
  markets.sort((a, b) =>
    direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
  );

// ─────────────────────────────────────────────
// GENERICS — reusable typed utilities
// ─────────────────────────────────────────────

// ✅ GOOD — typed API response wrapper
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}

const apiFetch = async <T>(url: string): Promise<ApiResponse<T>> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json() as T;
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
const parseConfigBad = (input: any) =>
  input; // could be anything, TypeScript won't complain

// ─────────────────────────────────────────────
// OPTIONAL CHAINING & NULLISH COALESCING
// ─────────────────────────────────────────────
// Rule: Prefer ?? (nullish coalescing) over || for null/undefined.
// || treats 0, "", false as falsy and replaces them; ?? only replaces null and undefined.

interface UserProfile {
  id: string;
  name: string;
  address?: {
    city?: string;
    country?: string;
  };
}

// ✅ GOOD — safe access; ?? for null/undefined default only
const getUserCity = (user: UserProfile): string =>
  user.address?.city ?? "Unknown city";
// Example: const pageSize = config.pageSize ?? 10; // 0 would be kept with ??, replaced with ||
// Example: const label = status?.description ?? "-";

// ❌ BAD — || replaces 0, "", false too (often unintended)
// const pageSize = config.pageSize || 10;   // 0 becomes 10
// const label = status?.description || "-"; // "" becomes "-"

// ❌ BAD — will throw if address is undefined
const getUserCityBad = (user: UserProfile): string =>
  user.address!.city!; // non-null assertion = lying to TypeScript
