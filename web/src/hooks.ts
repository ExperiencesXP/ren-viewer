import { type DependencyList, useEffect, useState } from "react";
import { SessionClosedError } from "./api";

export type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
  onClosed: () => void,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SessionClosedError) {
          onClosed();
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, tick]);

  return {
    data,
    error,
    loading,
    reload: () => setTick((n) => n + 1),
  };
}
