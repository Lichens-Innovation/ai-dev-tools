/**
 * NAMING CONVENTIONS — TypeScript / JavaScript
 * Rules:
 * - Use descriptive, intention-revealing names.
 * - Pattern: Verb-noun for functions, noun for variables, is/has/can for booleans.
 * - Use arrow functions only — never the "function" keyword for top-level or module-level functions.
 */

// Placeholder types for examples only
interface User {
  id: string;
  name: string;
}
interface Engine {
  id: number;
  name: string;
}
interface PumpTestStatusDto {
  StatusKey?: string;
  Description?: string;
}
interface PumpInfo {
  testId: string;
  status?: PumpTestStatusDto | null;
}
interface TableState {
  pageIndex: number;
  pageSize: number;
  filter: string;
}
interface ColoredLabel {
  label: string;
  color: string;
}
interface UserCapabilities {
  canEdit: boolean;
}
type StatusLabelKey = "passed" | "failed" | "warning";
interface DisplayToastErrorArgs {
  error?: unknown;
  message?: string;
}
interface PaginatedListResponse<T> {
  rows: T[];
}
const EMPTY_PAGINATED_RESPONSE: PaginatedListResponse<Engine> = { rows: [] };

// ─────────────────────────────────────────────
// FILES — kebab-case, optional domain suffix
// ─────────────────────────────────────────────

// ✅ GOOD — kebab-case; .types.ts, .utils.ts, .constants.ts, .store.ts for domain files
// pump-info-card.tsx
// use-test-engines-list.ts
// app.types.ts
// table-state.store.ts
// logger.utils.ts
// app.constants.ts

// ❌ BAD (not kebab-case)
// PumpInfoCard.tsx
// useTestEnginesList.ts
// AppTypes.ts

// ─────────────────────────────────────────────
// VARIABLES — camelCase, nouns, descriptive
// ─────────────────────────────────────────────

// ✅ GOOD
const marketSearchQuery = "election";
const isUserAuthenticated = true;
const hasAdminPermissions = false;
const canEditDocument = true;
const totalRevenue = 1000;
const maxRetryCount = 3;
const userList: User[] = [];
const paginatedEngines: PaginatedListResponse<Engine> = EMPTY_PAGINATED_RESPONSE;
const engines: Engine[] = paginatedEngines.rows ?? [];
const hasEngines: boolean = engines.length > 0;
const rawSort: string | undefined = "StartTimestamp:desc";
const normalizedSort = rawSort ?? undefined; // prefer ?? for null/undefined (not ||)

// ❌ BAD
const q = "election"; // misleading name
const flag = true; // meaningless name
const x = 1000; // magic number
const n = 3; // magic number
const arr: User[] = []; // what is in this array?

// ─────────────────────────────────────────────
// FUNCTIONS — arrow functions only, camelCase, verb-noun or get/set/is/has/can
// ─────────────────────────────────────────────

// Rule: Always use arrow functions (const fn = () => {}). Do not use the "function" keyword.

// ✅ GOOD — arrow functions
const fetchMarketData = async (marketId: string): Promise<void> => {};
const isValidEmail = (email: string): boolean => true;
const getStatusLabel = (type: StatusLabelKey): string => "";
const getStatusDisplayInfo = (status?: PumpTestStatusDto | null): ColoredLabel => ({
  label: "",
  color: "",
});
const stringToStatusKey = (statusKey?: string | null): TestStatusKey | undefined => undefined;
const isSystemStatus = (statusKey?: TestStatusKey | null): boolean => false;
const isTestStatusFail = (statusKey?: TestStatusKey | null): boolean => false;
const rolesToCapabilities = (userRoles: string[]): UserCapabilities => ({}) as UserCapabilities;

interface CalculateSimilarityScoreArgs {
  vectorA: number[];
  vectorB: number[];
}
const calculateSimilarityScore = ({ vectorA, vectorB }: CalculateSimilarityScoreArgs): number => 0;

interface FormatCurrencyArgs {
  amount: number;
  currency: string;
}
const formatCurrency = ({ amount, currency }: FormatCurrencyArgs): string => "";

// ❌ BAD — "function" keyword (forbidden)
// async function market(id: string) {} // not an arrow function
// const similarity = (a: number[], b: number[]) => {} // not using destructuring for arguments
// function process(data: any): any {} // not an arrow function and not typed

// ─────────────────────────────────────────────
// CONSTANTS — UPPER_SNAKE_CASE
// ─────────────────────────────────────────────

// ✅ GOOD — primitive or config constants
const MAX_RETRIES = 3;
const DEFAULT_PAGE_SIZE = 20;
const API_BASE_URL = "https://api.example.com";
const SESSION_TIMEOUT_MS = 30 * PeriodsInMS.oneMinute; // 30 minutes self-explanatory
const APP_VERSION_INFO = Object.freeze({ NAME: "app", VERSION: "1.0.0" });
const DEFAULT_TABLE_STATE: Readonly<TableState> = {
  pageIndex: 0,
  pageSize: 10,
  filter: "",
};
const TEST_KNOWN_STATUS_KEYS = { SUCCESS: "SUCCESS", FAIL: "FAIL" } as const;
const TEST_REQUEST_STATUSES = {
  pending: "pending",
  approved: "approved",
} as const;

// ✅ GOOD — query key / namespace objects (PascalCase acceptable for exported factories)
// export const PumpModelsQueryKey = { all: ["pump-models"] as const, list: (...) => [...] } as const;
// export const TestEnginesQueryKey = { all: ["test-engines"] as const, ... } as const;

// ❌ BAD — magic numbers inline
if (maxRetryCount > 3) {
} // What is 3?
const timeout = 1800000; // What is 1800000?
// ✅ GOOD — use PeriodsInMS for self-explanatory duration
const timeoutGood = 30 * PeriodsInMS.oneMinute; // 30 minutes

// ─────────────────────────────────────────────
// INTERFACES & TYPES — PascalCase, noun-based
// ─────────────────────────────────────────────

// ✅ GOOD
interface UserProfile {
  id: string;
  displayName: string;
  emailAddress: string;
  createdAt: Date;
}

interface PumpInfoCardProps {
  pumpInfo: PumpInfo;
}

type MarketStatus = "active" | "resolved" | "closed";
type TestStatusKey = (typeof TEST_KNOWN_STATUS_KEYS)[keyof typeof TEST_KNOWN_STATUS_KEYS]; // derived from const

// Parameter object types — *Args or *Params suffix when exported
interface GenerateTestDetailWorkbookArgs {
  testId: string;
  locale: string;
}
interface PaginatedListParams {
  filter?: string;
  sort?: string;
  pageIndex?: number;
  pageSize?: number;
}

// ❌ BAD (not descriptive)
interface data {
  i: string;
  n: string;
  e: string;
}

// ─────────────────────────────────────────────
// REACT — Components PascalCase, hooks useXxx, props XxxProps
// ─────────────────────────────────────────────

// ✅ GOOD — component export name matches concept (PascalCase)
// export const PumpInfoCard: FunctionComponent<PumpInfoCardProps> = ({ pumpInfo }) => { ... };
// export const TestStatusEditBadge: FunctionComponent<...> = ...
// export const HydraulicInstituteToleranceCheckbox: FunctionComponent<...> = ...

// ✅ GOOD — hooks: camelCase with use prefix; file name kebab-case
// use-test-engines-list.ts → export const useTestEnginesList = (...) => { ... };
// use-pump-test.ts → export const usePumpTest = (...) => { ... };
// use-table-state-store.ts → export const useTableStateStore = create(...);

// ✅ GOOD — props interface: ComponentName + Props
// interface PumpInfoCardProps { pumpInfo: PumpInfo; }
// interface HydraulicInstituteToleranceCheckboxProps { ... }
