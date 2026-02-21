/**
 * API RESPONSE FORMAT
 * Rule: All API responses must follow the standard ApiResponse envelope.
 *       Always include success flag. Use meta for pagination.
 */

// ─────────────────────────────────────────────
// STANDARD RESPONSE ENVELOPE
// ─────────────────────────────────────────────

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

// ─────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────

// ✅ GOOD — typed helper functions for consistent responses
const successResponse = <T>(data: T, meta?: PaginationMeta): ApiResponse<T> =>
  ({ success: true, data, ...(meta ? { meta } : {}) });

const errorResponse = (message: string): ApiResponse<never> =>
  ({ success: false, error: message });

const paginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): ApiResponse<T[]> => ({
  success: true,
  data,
  meta: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  },
});

// ─────────────────────────────────────────────
// ROUTE HANDLER EXAMPLES (Next.js / Express style)
// ─────────────────────────────────────────────

interface Market {
  id: string;
  name: string;
  status: "active" | "resolved" | "closed";
}

// ✅ GOOD — single item
const getMarketHandler = async (
  marketId: string
): Promise<ApiResponse<Market>> => {
  try {
    const market = await findMarketById(marketId);

    if (!market) {
      return errorResponse(`Market ${marketId} not found`);
    }

    return successResponse(market);
  } catch (error: unknown) {
    console.error("getMarketHandler error:", error);
    return errorResponse("Internal server error");
  }
};

// ✅ GOOD — paginated list
const listMarketsHandler = async (
  page = 1,
  limit = 20
): Promise<ApiResponse<Market[]>> => {
  try {
    const { markets, total } = await fetchMarketsPaginated(page, limit);
    return paginatedResponse(markets, total, page, limit);
  } catch (error: unknown) {
    console.error("listMarketsHandler error:", error);
    return errorResponse("Failed to load markets");
  }
};

// ✅ GOOD — create with validation
const createMarketHandler = async (
  body: unknown
): Promise<ApiResponse<Market>> => {
  try {
    const validated = validateCreateMarket(body);
    const market = await insertMarket(validated);
    return successResponse(market);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return errorResponse(error.message);
    }
    console.error("createMarketHandler error:", error);
    return errorResponse("Failed to create market");
  }
};

// ─────────────────────────────────────────────
// HTTP STATUS CODE CONVENTIONS
// ─────────────────────────────────────────────

// 200 OK           → successful GET, PUT, PATCH
// 201 Created      → successful POST (resource created)
// 204 No Content   → successful DELETE (no body)
// 400 Bad Request  → validation error, malformed request
// 401 Unauthorized → not authenticated
// 403 Forbidden    → authenticated but not authorized
// 404 Not Found    → resource does not exist
// 409 Conflict     → duplicate resource, constraint violation
// 500 Server Error → unexpected error (never expose details to client)

// ─────────────────────────────────────────────
// CLIENT-SIDE CONSUMPTION PATTERN
// ─────────────────────────────────────────────

// ✅ GOOD — always check success before using data
const loadMarket = async (id: string) => {
  const response = await fetch(`/api/markets/${id}`).then(
    (r) => r.json() as Promise<ApiResponse<Market>>
  );

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Unknown error");
  }

  return response.data; // TypeScript knows this is Market
};

// ─────────────────────────────────────────────
// Stubs
// ─────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

const findMarketById = async (id: string): Promise<Market | null> =>
  ({ id, name: "Example", status: "active" });

const fetchMarketsPaginated = async (page: number, limit: number) =>
  ({ markets: [] as Market[], total: 0 });

const insertMarket = async (data: unknown): Promise<Market> =>
  ({ id: "new", name: "New Market", status: "active" });

const validateCreateMarket = (body: unknown) => body;
