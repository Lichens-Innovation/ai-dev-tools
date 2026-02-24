/**
 * Query key factory pattern — use as single source of truth for TanStack Query cache keys.
 * Based on: technosub-test-benches-ui/src/providers/query-keys.ts
 * @see https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */

// Resource with list + detail by id
export const ExampleResourceQueryKey = {
  all: ["example-resource"] as const,
  list: (pageSize: number, filter = "", sort = "", pageIndex = 0) =>
    [...ExampleResourceQueryKey.all, "list", filter, sort, pageIndex, pageSize] as const,
  details: () => [...ExampleResourceQueryKey.all, "details"] as const,
  detail: (id: number) => [...ExampleResourceQueryKey.details(), id] as const,
} as const;

// Resource with a single sub-resource (e.g. curve by id + options)
export const ExampleCurveQueryKey = {
  all: ["example-curve"] as const,
  detail: (id: number, curveType: string, compensate?: boolean) =>
    [...ExampleCurveQueryKey.all, id, curveType, compensate] as const,
} as const;

// Simple resource (list only, no detail)
export const ExampleConfigQueryKey = {
  all: ["example-config"] as const,
  list: () => [...ExampleConfigQueryKey.all, "list"] as const,
} as const;
