import { createHmac } from 'crypto';
import { Merchant, TestApp, createProduct, createTestApp, customer, registerMerchant } from './helpers';

const APP_SECRET = 'meta-app-secret-123';
const ACCESS_TOKEN = 'EAAG-test-access-token-0123456789';
const PHONE_NUMBER_ID = '106540352242922';

describe('WhatsApp order confirmation', () => {
  let t: TestApp;
  let m: Merchant;
  let variantId: string;
  let fetchMock: jest.SpyInstance;
  let nextId = 0;

  const place = async () => {
    const res = await t
      .http()
      .post('/storefront/orders')
      .set('Host', m.host)
      .send({ ...customer, items: [{ variantId, quantity: 1 }] })
      .expect(201);
    await t.whatsapp.idle();
    const order = (await m.agent.get('/admin/orders')).body.find((o: any) => o.number === res.body.number);
    return { ...res.body, id: order.id } as { token: string; number: number; id: string };
  };
  const detail = async (id: string) => (await m.agent.get(`/admin/orders/${id}`).expect(200)).body;

  const webhook = (payload: object, secret = APP_SECRET) => {
    const raw = JSON.stringify(payload);
    return t
      .http()
      .post(`/webhooks/whatsapp/${m.tenantId}`)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`)
      .send(raw);
  };
  const inbound = (message: object, phoneNumberId = PHONE_NUMBER_ID) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, messages: [message] } }] }],
  });

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'wa');
    variantId = (await createProduct(m, { variants: [{ title: 'Default', pricePaisa: 250_000, stock: 50 }] })).variants[0].id;
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ messages: [{ id: `wamid.TEST${++nextId}` }] }), { status: 200 }),
    );
  });

  afterAll(async () => {
    fetchMock.mockRestore();
    await t.app.close();
  });

  it('works with click-to-chat links before any credentials exist', async () => {
    expect((await m.agent.get('/admin/whatsapp').expect(200)).body.status).toBe('NOT_CONFIGURED');
    const order = await place();
    expect(fetchMock).not.toHaveBeenCalled();

    // No store WhatsApp number yet: the shopper gets no button.
    let pub = await t.http().get(`/storefront/orders/${order.token}`).set('Host', m.host).expect(200);
    expect(pub.body.whatsappConfirmUrl).toBeNull();

    const settings = (await m.agent.get('/admin/settings')).body;
    await m.agent.put('/admin/settings').send({ ...settings, whatsappNumber: '0321 7654321' }).expect(200);
    pub = await t.http().get(`/storefront/orders/${order.token}`).set('Host', m.host).expect(200);
    const shopperUrl = new URL(pub.body.whatsappConfirmUrl);
    expect(shopperUrl.origin + shopperUrl.pathname).toBe('https://wa.me/923217654321');
    expect(shopperUrl.searchParams.get('text')).toContain(`confirm my order #${order.number}`);

    // The merchant gets a pre-written chat to the customer with the confirmation link.
    const d = await detail(order.id);
    const merchantUrl = new URL(d.whatsapp.customerChatUrl);
    expect(merchantUrl.pathname).toBe('/923001234567');
    expect(merchantUrl.searchParams.get('text')).toContain(`http://${m.host}/orders/${order.token}`);
    expect(d.whatsapp.confirmationPageUrl).toBe(`http://${m.host}/orders/${order.token}`);
    expect(d.notifications).toEqual([]);

    await m.agent.post(`/admin/orders/${order.id}/whatsapp-confirmation`).expect(400);
  });

  it('stores Cloud API credentials encrypted and unverified', async () => {
    await m.agent.put('/admin/whatsapp').send({ phoneNumberId: '0300', templateName: 'order_confirmation', templateLanguage: 'en', autoSend: true }).expect(400);
    const saved = await m.agent
      .put('/admin/whatsapp')
      .send({ phoneNumberId: PHONE_NUMBER_ID, accessToken: ACCESS_TOKEN, appSecret: APP_SECRET, templateName: 'order_confirmation', templateLanguage: 'en', autoSend: true })
      .expect(200);
    expect(saved.body).toMatchObject({ status: 'UNVERIFIED', hasAppSecret: true, phoneNumberId: PHONE_NUMBER_ID });
    expect(saved.body.webhookUrl).toContain(`/webhooks/whatsapp/${m.tenantId}`);
    expect(JSON.stringify(saved.body)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(saved.body)).not.toContain(APP_SECRET);

    const row = await t.db.tenant(m.tenantId, (tx) => tx.whatsappAccount.findUniqueOrThrow({ where: { tenantId: m.tenantId } }));
    expect(row.accessTokenEnc).not.toContain(ACCESS_TOKEN);
    expect(row.appSecretEnc).not.toContain(APP_SECRET);
  });

  it('sends the confirmation template automatically when a COD order is placed', async () => {
    const order = await place();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.example/v23.0/${PHONE_NUMBER_ID}/messages`);
    expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ messaging_product: 'whatsapp', to: '923001234567', type: 'template' });
    expect(sent.template).toMatchObject({ name: 'order_confirmation', language: { code: 'en' } });
    expect(sent.template.components[0].parameters.map((p: any) => p.text)).toEqual(['Ayesha Khan', String(order.number), 'Store wa', '2,750']);
    expect(sent.template.components[1].parameters[0].payload).toBe('CONFIRM_ORDER');
    expect(sent.template.components[2].parameters[0].payload).toBe('CANCEL_ORDER');

    const d = await detail(order.id);
    expect(d.notifications).toHaveLength(1);
    expect(d.notifications[0]).toMatchObject({ status: 'SENT', recipient: '923001234567', providerMessageId: `wamid.TEST${nextId}` });
    expect(d.events.map((e: any) => e.type)).toContain('whatsapp_sent');
    // Meta accepted a real send, so the integration is now verified.
    expect((await m.agent.get('/admin/whatsapp')).body.status).toBe('VERIFIED');
  });

  it('answers the Meta webhook verification challenge only with the right token', async () => {
    const { verifyToken } = (await m.agent.get('/admin/whatsapp')).body;
    const ok = await t.http().get(`/webhooks/whatsapp/${m.tenantId}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken, 'hub.challenge': '424242' }).expect(200);
    expect(ok.text).toBe('424242');
    await t.http().get(`/webhooks/whatsapp/${m.tenantId}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' }).expect(403);
    await t.http().get('/webhooks/whatsapp/not-a-tenant').expect(404);
  });

  it('confirms the order when the customer taps Confirm', async () => {
    const order = await place();
    const wamid = (await detail(order.id)).notifications[0].providerMessageId;
    const message = { from: '923001234567', type: 'button', button: { payload: 'CONFIRM_ORDER', text: 'Confirm order' }, context: { id: wamid } };

    await webhook(inbound(message), 'wrong-secret').expect(403);
    await t.http().post(`/webhooks/whatsapp/${m.tenantId}`).send(inbound(message)).expect(403);
    expect((await detail(order.id)).status).toBe('PENDING');

    await webhook(inbound(message)).expect(200);
    const d = await detail(order.id);
    expect(d).toMatchObject({ status: 'CONFIRMED', confirmedVia: 'whatsapp_reply' });
  });

  it('cancels and restocks when the customer taps Cancel', async () => {
    const order = await place();
    const wamid = (await detail(order.id)).notifications[0].providerMessageId;
    await webhook(inbound({ from: '923001234567', type: 'button', button: { payload: 'CANCEL_ORDER' }, context: { id: wamid } })).expect(200);
    expect((await detail(order.id)).status).toBe('CANCELLED');
  });

  it('accepts a typed YES from the customer for their latest pending order', async () => {
    const order = await place();
    await webhook(inbound({ from: '923001234567', type: 'text', text: { body: 'Yes please' } })).expect(200);
    expect((await detail(order.id)).status).toBe('CONFIRMED');
  });

  it('ignores replies from other numbers, other business numbers and unrelated text', async () => {
    const order = await place();
    const wamid = (await detail(order.id)).notifications[0].providerMessageId;
    const button = { type: 'button', button: { payload: 'CONFIRM_ORDER' }, context: { id: wamid } };
    await webhook(inbound({ ...button, from: '923339999999' })).expect(200);
    await webhook(inbound({ ...button, from: '923001234567' }, '999999999')).expect(200);
    await webhook(inbound({ from: '923001234567', type: 'text', text: { body: 'when will it arrive?' } })).expect(200);
    expect((await detail(order.id)).status).toBe('PENDING');
  });

  it('tracks delivery receipts', async () => {
    const order = await place();
    const wamid = (await detail(order.id)).notifications[0].providerMessageId;
    const status = (s: string) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_NUMBER_ID }, statuses: [{ id: wamid, status: s }] } }] }] });
    await webhook(status('delivered')).expect(200);
    expect((await detail(order.id)).notifications[0].status).toBe('DELIVERED');
    await webhook(status('read')).expect(200);
    expect((await detail(order.id)).notifications[0].status).toBe('READ');
  });

  it('keeps the order and records the reason when WhatsApp rejects the send', async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: { message: '(#132001) Template name does not exist in the translation' } }), { status: 404 }),
    );
    const order = await place();
    const d = await detail(order.id);
    expect(d.status).toBe('PENDING');
    expect(d.notifications[0]).toMatchObject({ status: 'FAILED', error: expect.stringContaining('132001') });
    expect((await m.agent.get('/admin/whatsapp')).body.lastError).toContain('132001');

    // The merchant can resend from the order page.
    const resent = await m.agent.post(`/admin/orders/${order.id}/whatsapp-confirmation`).expect(200);
    expect(resent.body.status).toBe('SENT');
  });

  it('respects the automatic-send switch and disconnecting', async () => {
    const calls = fetchMock.mock.calls.length;
    await m.agent.put('/admin/whatsapp').send({ phoneNumberId: PHONE_NUMBER_ID, templateName: 'order_confirmation', templateLanguage: 'en', autoSend: false }).expect(200);
    expect((await m.agent.get('/admin/whatsapp')).body.status).toBe('VERIFIED');
    await place();
    expect(fetchMock.mock.calls.length).toBe(calls);

    await m.agent.delete('/admin/whatsapp').expect(200);
    expect((await m.agent.get('/admin/whatsapp')).body.status).toBe('NOT_CONFIGURED');
    await t.http().get(`/webhooks/whatsapp/${m.tenantId}`).expect(404);
  });
});
