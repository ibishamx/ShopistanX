'use client';

import { inputClass } from '@shopistan/ui';
import { useId, useState } from 'react';

/** Tag editor: type and press Enter or comma; suggestions come from tags already in use. */
export function TagsInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = (raw: string) => {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const next = [...value];
    for (const t of parts) if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    onChange(next);
    setDraft('');
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">Tags</label>
      <input
        id={id}
        className={inputClass}
        list={`${id}-suggest`}
        value={draft}
        placeholder="Khaddar, Winter Collection"
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft.trim()) add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      <datalist id={`${id}-suggest`}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
          {value.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} className="cursor-pointer text-muted hover:text-ink" onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-muted">Press Enter after each tag. Tags can put products into automatic collections.</p>
    </div>
  );
}
