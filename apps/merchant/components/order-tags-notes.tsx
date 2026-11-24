'use client';

import { Button, Card, Textarea, api } from '@shopistan/ui';
import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { TagsInput } from './tags-input';

/** Private labels and notes on an order. Saved separately so they never clash with order actions. */
export function OrderTagsNotes({ orderId, initialTags, initialNote }: { orderId: string; initialTags: string[]; initialNote: string | null }) {
  const [tags, setTags] = useState(initialTags);
  const [note, setNote] = useState(initialNote ?? '');
  const [savedNote, setSavedNote] = useState(initialNote ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: all } = useApi<{ tag: string }[]>('/admin/orders/tags');

  async function saveTags(next: string[]) {
    setTags(next);
    setStatus(null);
    try {
      const res = await api(`/admin/orders/${orderId}/tags`, { method: 'PUT', body: { tags: next } });
      setTags(res.tags);
      setStatus('Tags saved');
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  async function saveNote() {
    setBusy(true);
    setStatus(null);
    try {
      await api(`/admin/orders/${orderId}/note`, { method: 'PUT', body: { note } });
      setSavedNote(note.trim());
      setStatus('Note saved');
    } catch (e: any) {
      setStatus(e.message);
    }
    setBusy(false);
  }

  return (
    <Card title="Tags and notes">
      <div className="space-y-4">
        <TagsInput placeholder="PostEx, Called" hint="Press Enter after each tag, e.g. PostEx or Called. Use tags to filter and group orders." value={tags} onChange={saveTags} suggestions={all?.map((t) => t.tag) ?? ['PostEx', 'Leopards', 'COD-Confirmed', 'Called', 'VIP']} />
        <div>
          <Textarea label="Notes" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} hint="Only you and your staff see these." />
          {note.trim() !== savedNote && (
            <Button type="button" variant="secondary" busy={busy} className="mt-2" onClick={saveNote}>Save note</Button>
          )}
        </div>
        {status && <p role="status" className="text-xs text-muted">{status}</p>}
      </div>
    </Card>
  );
}
