/**
 * Hook template — use when creating a data-fetching or effect hook.
 * File name: kebab-case (e.g. use-my-feature.ts).
 * Export: named only. Reserve "use" prefix for real hooks.
 */

import { useEffect, useState } from "react";

// Extract param types to named interfaces (no inline types).
interface UseExampleHookParams {
  id?: number;
  enabled?: boolean;
}

// Optional: extract return type for reuse or documentation.
interface UseExampleHookReturn {
  data: string | null;
  isLoading: boolean;
  hasData: boolean;
}

const fetchExample = async ({ id }: Required<Pick<UseExampleHookParams, "id">>): Promise<string> => {
  // In real code: replace with actual API call. Always use try/catch and context prefix in errors.
  return `result-${id}`;
};

export const useExampleHook = ({ id, enabled = true }: UseExampleHookParams): UseExampleHookReturn => {
  const [data, setData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || id === undefined) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchExample({ id });
        if (!cancelled) setData(result);
      } catch (e) {
        // logger.error({ err: e }, "[useExampleHook] Failed to load");
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id, enabled]);

  const hasData: boolean = data !== null && data.length > 0;

  return {
    data,
    isLoading,
    hasData,
  };
};
