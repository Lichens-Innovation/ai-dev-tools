/**
 * REACT CUSTOM HOOKS
 * Rule: Extract reusable stateful logic into custom hooks prefixed with `use`.
 *       Hooks should have a single, clear responsibility.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────
// useDebounce — delay value changes
// ─────────────────────────────────────────────

// ✅ GOOD — generic, reusable
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs]);

  return debouncedValue;
}

// Usage
// const debouncedSearch = useDebounce(searchQuery, 300);

// ─────────────────────────────────────────────
// useAsync — wraps any async operation
// ─────────────────────────────────────────────

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

// ✅ GOOD — reusable across all data-fetching components
export function useAsync<T>(asyncFn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState({ data: null, isLoading: true, error: null });

    asyncFn()
      .then((data) => {
        if (!cancelled) setState({ data, isLoading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            data: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

// Usage
// const { data, isLoading, error } = useAsync(() => fetchMarket(id), [id]);

// ─────────────────────────────────────────────
// useLocalStorage — persisted state
// ─────────────────────────────────────────────

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error: unknown) {
        console.error(`useLocalStorage: failed to save "${key}"`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue] as const;
}

// Usage
// const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light");

// ─────────────────────────────────────────────
// usePrevious — track previous value
// ─────────────────────────────────────────────

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

// ─────────────────────────────────────────────
// RULES FOR CUSTOM HOOKS
// ─────────────────────────────────────────────

// ✅ Always prefix with `use`
// ✅ Single responsibility — one concern per hook
// ✅ Return a consistent shape (object or tuple)
// ✅ Clean up side effects in useEffect's return function
// ✅ Memoize callbacks with useCallback when passed as deps

// ❌ Never call hooks conditionally
// ❌ Never call hooks in loops
// ❌ Never put non-hook logic in a hook just for code organization
