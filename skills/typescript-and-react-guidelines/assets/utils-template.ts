/**
 * Utility template — use for pure or side-effect helpers.
 * File name: kebab-case with .utils.ts suffix (e.g. format-date.utils.ts).
 * No mutations. Extract types. Use logger with context prefix in catch blocks.
 */

const DEFAULT_LIMIT = 100;

interface FormatItemsArgs {
  items: string[];
  limit?: number;
  separator?: string;
}

interface FormatItemsResult {
  text: string;
  total: number;
}

export const formatItems = ({ items, limit = DEFAULT_LIMIT, separator = ", " }: FormatItemsArgs): FormatItemsResult => {
  if (items.length === 0) {
    return { text: "", total: 0 };
  }

  const safeLimit = Math.min(items.length, limit);
  const slice = items.slice(0, safeLimit);
  const text = slice.join(separator);
  const total = items.length;

  return { text, total };
};

// Example with async and error handling (use logger from your app, e.g. logger.utils):
// export const fetchWithToast = async ({ url }: { url: string }): Promise<Data> => {
//   try {
//     const res = await fetch(url);
//     if (!res.ok) throw new Error(res.statusText);
//     return res.json();
//   } catch (e) {
//     // logger.error({ err: e }, "[fetchWithToast] Request failed");
//     throw e;
//   }
// };
