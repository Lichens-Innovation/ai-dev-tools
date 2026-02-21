/**
 * ERROR HANDLING PATTERNS
 * Rule: ALL async functions must have try/catch with meaningful error messages.
 *       Never silently swallow errors.
 */
export {};

// ─────────────────────────────────────────────
// BASIC FETCH WITH ERROR HANDLING
// ─────────────────────────────────────────────

// ✅ GOOD
const fetchData = async (url: string) => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: unknown) {
    console.error("Fetch failed:", error);
    throw new Error(`Failed to fetch data from ${url}`);
  }
};

// ❌ BAD — no error handling, raw response.json() can fail too
const fetchDataBad = async (url: string) => {
  const response = await fetch(url);
  return response.json();
};

// ─────────────────────────────────────────────
// TYPED ERRORS
// ─────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class ValidationError extends Error {
  constructor(message: string, public fields: Record<string, string>) {
    super(message);
    this.name = "ValidationError";
  }
}

// ✅ GOOD — differentiated error handling
const createMarket = async (data: unknown) => {
  try {
    const validated = validateMarketData(data);
    const result = await saveMarket(validated);
    return result;
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      // Handle validation errors differently
      return { success: false, errors: error.fields };
    }
    if (error instanceof ApiError && error.statusCode === 409) {
      // Handle conflict specifically
      return { success: false, error: "Market already exists" };
    }
    // Re-throw unexpected errors
    throw error;
  }
};

// ─────────────────────────────────────────────
// RESULT PATTERN (functional alternative)
// ─────────────────────────────────────────────

type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// ✅ GOOD — explicit success/failure without throwing
const safeParseJson = async <T>(text: string): Promise<Result<T>> => {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch (error: unknown) {
    return {
      success: false,
      error: new Error(`Invalid JSON: ${(error as Error).message}`),
    };
  }
};

// Usage
const result = await safeParseJson<{ name: string }>('{"name": "Alice"}');
if (result.success) {
  console.log(result.data.name); // TypeScript knows this is safe
} else {
  console.error(result.error.message);
}

// ─────────────────────────────────────────────
// NEVER swallow errors silently
// ─────────────────────────────────────────────

// ❌ BAD — empty catch, error is lost
const silentFail = async () => {
  try {
    await doSomethingRisky();
  } catch (_: unknown) {
    // 🚫 Error silently swallowed — never do this
  }
};

// ✅ GOOD — at minimum, log and rethrow
const properFail = async () => {
  try {
    await doSomethingRisky();
  } catch (error: unknown) {
    console.error("doSomethingRisky failed:", error);
    throw error;
  }
};

// Placeholder stubs for the examples above
const validateMarketData = (data: unknown) => data;
const saveMarket = async (data: unknown) => data;
const doSomethingRisky = async () => {};
