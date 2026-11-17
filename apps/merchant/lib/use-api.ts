'use client';

import { ApiError, api } from '@shopistan/ui';
import { useCallback, useEffect, useState } from 'react';

/** Loads a resource from the API; `reload` refetches without flashing the loading state. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = '/login';
        return;
      }
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
