'use client';

import { Badge, Button, Card, Input, Notice, Toggle, api, dateTime, pkPhone } from '@shopistan/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

const STATUS: Record<string, { label: string; tone: 'gray' | 'amber' | 'green' }> = {
  NOT_CONFIGURED: { label: 'Not connected', tone: 'gray' },
  UNVERIFIED: { label: 'Saved, not verified', tone: 'amber' },
  VERIFIED: { label: 'Verified', tone: 'green' },
};

const TEMPLATE_BODY = `Assalam o Alaikum {{1}}, thank you for your order #{{2}} at {{3}}.

Total: Rs {{4}} (Cash on Delivery).

Please confirm your order so we can dispatch it.`;

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-canvas px-3 py-2 text-xs">{value}</code>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

export default function WhatsappSettingsPage() {
  const { data: wa, error, loading, setData } = useApi('/admin/whatsapp');
  const { data: settings } = useApi('/admin/settings');
  const [form, setForm] = useState({ phoneNumberId: '', accessToken: '', appSecret: '', templateName: 'order_confirmation', templateLanguage: 'en', autoSend: true });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const connected = wa && wa.status !== 'NOT_CONFIGURED';

  useEffect(() => {
    if (wa?.phoneNumberId) {
      setForm((f) => ({ ...f, phoneNumberId: wa.phoneNumberId, templateName: wa.templateName, templateLanguage: wa.templateLanguage, autoSend: wa.autoSend, accessToken: '', appSecret: '' }));
    }
  }, [wa?.phoneNumberId, wa?.templateName, wa?.templateLanguage, wa?.autoSend]);

  if (loading) return <Loading />;
  if (error || !wa) return <LoadError error={error!} />;
  const status = STATUS[wa.status];
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    setSaveError(null);
    setNotice(null);
    try {
      const { accessToken, appSecret, ...rest } = form;
      setData(await api('/admin/whatsapp', { method: 'PUT', body: { ...rest, ...(accessToken ? { accessToken } : {}), ...(appSecret ? { appSecret } : {}) } }));
      setNotice({ tone: 'green', text: 'Saved. Send a test message to verify the connection.' });
    } catch (err: any) {
      setSaveError(err.message);
    }
    setBusy(null);
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setBusy('test');
    setNotice(null);
    try {
      const result = await api('/admin/whatsapp/test', { body: { to: testTo } });
      setNotice(result.ok
        ? { tone: 'green', text: 'WhatsApp accepted the test message. Check that phone; the connection is now verified.' }
        : { tone: 'red', text: `WhatsApp rejected the message: ${result.error}` });
      setData(await api('/admin/whatsapp'));
    } catch (err: any) {
      setNotice({ tone: 'red', text: err.message });
    }
    setBusy(null);
  }

  async function disconnect() {
    if (!window.confirm('Disconnect WhatsApp Business? Automatic confirmation messages will stop. Click-to-chat keeps working.')) return;
    setBusy('disconnect');
    await api('/admin/whatsapp', { method: 'DELETE' }).catch(() => {});
    setData(await api('/admin/whatsapp'));
    setForm({ phoneNumberId: '', accessToken: '', appSecret: '', templateName: 'order_confirmation', templateLanguage: 'en', autoSend: true });
    setNotice(null);
    setBusy(null);
  }

  return (
    <>
      <PageHeader title="WhatsApp order confirmation" />
      <div className="space-y-5">
        <Card title="1. Click-to-chat" action={<Badge tone={settings?.whatsappNumber ? 'green' : 'gray'}>{settings?.whatsappNumber ? 'On' : 'Add your number'}</Badge>}>
          <p className="text-sm text-muted">Works with any WhatsApp number, no setup with Meta.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>After ordering, customers see a “Confirm on WhatsApp” button that opens a chat with your store, with their order details already written.</li>
            <li>On each order you get a “Message on WhatsApp” button that opens a chat with the customer, with a confirmation message and link already written.</li>
          </ul>
          <p className="mt-3 text-sm">
            {settings?.whatsappNumber ? <>Customers message <strong>{pkPhone(settings.whatsappNumber)}</strong>. </> : 'Your store has no WhatsApp number yet, so customers do not see the button. '}
            <Link href="/settings" className="font-medium text-brand-700 hover:underline">{settings?.whatsappNumber ? 'Change number' : 'Add your WhatsApp number'}</Link>
          </p>
        </Card>

        <Card title="2. Automatic messages (WhatsApp Business Cloud API)" action={<Badge tone={status.tone}>{status.label}</Badge>}>
          <p className="text-sm text-muted">
            Sends every COD customer a confirmation request with Confirm and Cancel buttons the moment they order, from your own WhatsApp Business number. Their reply updates the order automatically. Needs a Meta Business account, a WhatsApp Business phone number and an approved message template.
          </p>
          {wa.status === 'UNVERIFIED' && <div className="mt-3"><Notice tone="amber">These credentials have not sent a message yet. Send a test below to verify them.</Notice></div>}
          {wa.lastError && <div className="mt-3"><Notice>Last send failed: {wa.lastError}</Notice></div>}
          {wa.verifiedAt && !wa.lastError && <p className="mt-3 text-xs text-muted">Last successful send {dateTime(wa.verifiedAt)}.</p>}

          <form onSubmit={save} className="mt-5 space-y-4">
            {saveError && <Notice>{saveError}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Phone number ID" required inputMode="numeric" value={form.phoneNumberId} onChange={set('phoneNumberId')} hint="Meta → WhatsApp → API Setup. A long number, not your phone number." />
              <Input label="Access token" type="password" autoComplete="off" required={!connected} value={form.accessToken} onChange={set('accessToken')} placeholder={connected ? 'Saved. Enter a new one to replace it' : ''} hint="Use a permanent System User token. Stored encrypted." />
              <Input label="App secret" type="password" autoComplete="off" value={form.appSecret} onChange={set('appSecret')} placeholder={wa.hasAppSecret ? 'Saved. Enter a new one to replace it' : ''} hint="Meta → App settings → Basic. Needed to accept customer replies." />
              <Input label="Template name" required value={form.templateName} onChange={set('templateName')} />
              <Input label="Template language code" required value={form.templateLanguage} onChange={set('templateLanguage')} hint="For example en, en_US or ur" />
            </div>
            <Toggle label="Send automatically when a COD order is placed" hint="When off, send it yourself from the order page." checked={form.autoSend} onChange={(autoSend) => setForm({ ...form, autoSend })} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" busy={busy === 'save'}>{connected ? 'Save changes' : 'Connect'}</Button>
              {connected && <Button type="button" variant="danger" busy={busy === 'disconnect'} onClick={disconnect}>Disconnect</Button>}
            </div>
          </form>
        </Card>

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {connected && (
          <>
            <Card title="Send a test message">
              <form onSubmit={sendTest} className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <Input label="Your mobile number" type="tel" required placeholder="0300 1234567" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                </div>
                <Button type="submit" variant="secondary" busy={busy === 'test'}>Send test</Button>
              </form>
              <p className="mt-2 text-xs text-muted">Sends your template with sample order details. The connection is marked verified once WhatsApp accepts it.</p>
            </Card>
            <Card title="Receive customer replies">
              <div className="space-y-4">
                <p className="text-sm text-muted">In your Meta app, open WhatsApp → Configuration, set this webhook and subscribe to the <strong>messages</strong> field.</p>
                <Copyable label="Callback URL" value={wa.webhookUrl} />
                <Copyable label="Verify token" value={wa.verifyToken} />
                {!wa.hasAppSecret && <Notice tone="amber">Add your App secret above. Replies are rejected until it is saved, because they cannot be checked as genuine.</Notice>}
              </div>
            </Card>
          </>
        )}

        <Card title="Message template to create in WhatsApp Manager">
          <dl className="space-y-3 text-sm">
            <div><dt className="font-medium">Category</dt><dd className="text-muted">Utility</dd></div>
            <div>
              <dt className="font-medium">Body</dt>
              <dd><pre className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 font-sans text-sm">{TEMPLATE_BODY}</pre></dd>
              <dd className="mt-1 text-xs text-muted">{'{{1}}'} customer name · {'{{2}}'} order number · {'{{3}}'} store name · {'{{4}}'} total</dd>
            </div>
            <div><dt className="font-medium">Buttons (quick reply, in this order)</dt><dd className="text-muted">1. Confirm order &nbsp; 2. Cancel order</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
