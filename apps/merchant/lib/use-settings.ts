'use client';

import { api } from '@shopistan/ui';
import { useEffect, useState } from 'react';
import { useApi } from './use-api';

/** Loads store settings into an editable draft and saves the whole object back. */
export function useSettings() {
  const { data, error, loading } = useApi('/admin/settings');
  const [draft, setDraft] = useState<any>(null);
  const [saveError, setSaveError] = useState<{ message: string; field?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const update = (patch: Record<string, unknown>) => {
    setSaved(false);
    setDraft((d: any) => ({ ...d, ...patch }));
  };

  async function save(override?: Record<string, unknown>) {
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      setDraft(await api('/admin/settings', { method: 'PUT', body: { ...draft, ...override } }));
      setSaved(true);
    } catch (e: any) {
      setSaveError({ message: e.message, field: e.field });
    }
    setBusy(false);
  }

  return { draft, update, save, loading: loading || (!draft && !error), error, saveError, saved, busy };
}
