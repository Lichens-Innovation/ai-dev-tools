/**
 * ERROR HANDLING PATTERNS
 * Important Rules:
 * - Avoid nested try-catch blocks.
 * - Add context to the error message.
 * - Avoid silently swallow errors (rethrow the error or explain why it's ok to swallow).
 */
export {};

// ─────────────────────────────────────────────
// AVOID NESTED TRY-CATCH
// ─────────────────────────────────────────────
// Nested try-catch blocks make the code hard to follow and maintain.
// Prefer a single try-catch at the call site, or extract logic into
// small functions that each handle one level of errors.

// ❌ BAD — nested try-catch, unclear flow and duplicated handling
const processOrderBad = async (orderId: string) => {
  try {
    const order = await fetchOrder(orderId);
    try {
      const payment = await chargePayment(order);
      try {
        await sendConfirmation(payment);
        return { success: true };
      } catch (e: unknown) {
        console.error("Confirmation failed:", e);
        throw e;
      }
    } catch (e: unknown) {
      console.error("Payment failed:", e);
      throw e;
    }
  } catch (e: unknown) {
    console.error("Order fetch failed:", e);
    throw e;
  }
};

// ✅ GOOD — single try-catch, or small functions with one responsibility
const processOrderGood = async (orderId: string) => {
  try {
    const order = await fetchOrder(orderId);
    const payment = await chargePayment(order);
    await sendConfirmation(payment);
    return { success: true };
  } catch (error: unknown) {
    console.error("[processOrder] failed:", error);
    throw error;
  }
};

// Placeholder stubs for nested try-catch example
const fetchOrder = async (_id: string) => ({ id: "1" });
const chargePayment = async (_order: unknown) => ({ id: "pay-1" });
const sendConfirmation = async (_payment: unknown) => {};

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
  constructor(
    message: string,
    public fields: Record<string, string>
  ) {
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

type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

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

// Usage — use a named type instead of inline { name: string }
interface JsonNamePayload {
  name: string;
}
const result = await safeParseJson<JsonNamePayload>('{"name": "Alice"}');
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

// ✅ GOOD — at minimum, log (or send to Sentry); rethrow only if caller should handle
const properFail = async () => {
  try {
    await doSomethingRisky();
  } catch (error: unknown) {
    console.error("doSomethingRisky failed:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────
// AVOID CATCH THAT ONLY RE-THROWS THE SAME EXCEPTION
// ─────────────────────────────────────────────
// Either handle/log the error or let it propagate without a try-catch.

// ❌ BAD — redundant; catch adds no value
const processDataBad = (data?: string) => {
  try {
    if (!data) throw new Error("Data is required");
    internalProcess(data);
  } catch (error) {
    throw error; // No handling, no logging — remove the try-catch
  }
};

// ✅ GOOD — either handle (e.g. log and return) or omit try-catch and let propagate
const processDataGood = (data: string) => {
  try {
    internalProcess(data);
  } catch (error: unknown) {
    console.error("[processData] failed:", error);
    // Handle: return default, cleanup, or rethrow with context
  }
};

// ✅ GOOD — no try-catch; let caller handle
const processDataPropagate = (data: string) => {
  if (!data) throw new Error("Data is required");
  internalProcess(data);
};

const internalProcess = (_data: string) => {};

// Placeholder stubs for the examples above
const validateMarketData = (data: unknown) => data;
const saveMarket = async (data: unknown) => data;
const doSomethingRisky = async () => {};
