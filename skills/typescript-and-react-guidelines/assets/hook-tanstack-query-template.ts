/**
 * TanStack Query (React Query) hook template — use when creating a data-fetching hook with @tanstack/react-query.
 * File name: kebab-case (e.g. use-my-list.ts).
 * Patterns from: technosub-test-benches-ui (use-test-engines-list, use-pump-test, query-keys).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

// ─── Types (extract to *.types.ts or colocate) ───────────────────────────────────────────────

interface ItemDto {
  id: number;
  name: string;
}

interface ListParams {
  filter?: string;
  pageIndex?: number;
  pageSize: number;
}

interface ListResponse {
  rows: ItemDto[];
  totalRows: number;
}

// ─── Query key factory (single source of truth for cache keys) ───────────────────────────────

const ExampleListQueryKey = {
  all: ["example-list"] as const,
  list: (pageSize: number, filter = "", pageIndex = 0) =>
    [...ExampleListQueryKey.all, "list", filter, pageIndex, pageSize] as const,
} as const;

// ─── Fetch function (typed params and return; use try/catch + context prefix in real code) ───

const EMPTY_LIST_RESPONSE: ListResponse = {
  rows: [],
  totalRows: 0,
};

const fetchExampleList = async (params: ListParams): Promise<ListResponse> => {
  const { filter = "", pageIndex = 0, pageSize } = params;
  // Replace with actual API call (e.g. apiClient.get(...)).
  return { rows: [], totalRows: 0 };
};

// ─── Hook ───────────────────────────────────────────────────────────────────────────────────

export const useExampleList = ({ filter, pageIndex, pageSize }: ListParams) => {
  const { data, isLoading, isFetching, isError, error, ...rest } = useQuery({
    queryKey: ExampleListQueryKey.list(pageSize, filter ?? "", pageIndex ?? 0),
    queryFn: () => fetchExampleList({ filter, pageIndex, pageSize }),
    placeholderData: keepPreviousData,
    // enabled: !!someRequiredParam,  // optional: disable when param missing
  });

  const response: ListResponse = data ?? EMPTY_LIST_RESPONSE;
  const items: ItemDto[] = response.rows ?? [];
  const hasItems: boolean = items.length > 0;

  return {
    items,
    totalRows: response.totalRows,
    hasItems,
    isLoadingList: isLoading,
    isFetchingList: isFetching,
    isErrorList: isError,
    errorList: error,
    ...rest,
  };
};

// Optional: use useEffect to show toast on error (include context prefix in message).
// useEffect(() => {
//   if (isError && error) {
//     displayToastError({ message: "[useExampleList] Failed to load list", error });
//   }
// }, [isError, error]);
