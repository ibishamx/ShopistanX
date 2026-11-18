import { Merchant, TestApp, createProduct, createTestApp, customer, registerMerchant } from './helpers';

describe('COD form orders', () => {
  let t: TestApp;
  let m: Merchant;
  let product: any;
  let variantId: string;

  const place = (body: Record<string, unknown>) => t.http().post('/storefront/orders').set('Host', m.host).send(body);
  const stock = async () => (await m.agent.get(`/admin/products/${product.id}`)).body.variants[0].stock;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'cod');
    product = await createProduct(m);
    variantId = product.variants[0].id;
  });

  afterAll(() => t.app.close());

  it('exposes the COD form configuration to the storefront', async () => {
    const store = await t.http().get('/storefront/store').set('Host', m.host).expect(200);
    expect(store.body.codForm).toMatchObject({ enabled: true, buttonText: 'Place order' });
    expect(store.body.shippingFeePaisa).toBe(25_000);
  });

  it('places an order with server-computed totals and reserves stock', async () => {
    const res = await place({ ...customer, items: [{ variantId, quantity: 2 }], totalPaisa: 1 }).expect(201);
    expect(res.body.number).toBe(1001);

    const order = await t.http().get(`/storefront/orders/${res.body.token}`).set('Host', m.host).expect(200);
    expect(order.body).toMatchObject({
      status: 'PENDING',
      subtotalPaisa: 500_000,
      shippingPaisa: 25_000,
      totalPaisa: 525_000,
      phone: '0300 1234567',
    });
    expect(await stock()).toBe(3);

    const list = await m.agent.get('/admin/orders?filter=pending').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ number: 1001, phone: '923001234567', paymentMethod: 'COD', source: 'cod_form' });
  });

  it('numbers orders sequentially and reuses the customer by phone', async () => {
    const res = await place({ ...customer, phone: '+92 300 1234567', items: [{ variantId, quantity: 1 }] }).expect(201);
    expect(res.body.number).toBe(1002);
    const customers = await m.agent.get('/admin/customers').expect(200);
    expect(customers.body).toHaveLength(1);
    expect(customers.body[0].orders).toBe(2);
  });

  it('rejects invalid input with a field-level message', async () => {
    const bad = await place({ ...customer, phone: '12345', items: [{ variantId, quantity: 1 }] }).expect(400);
    expect(bad.body.field).toBe('phone');
    await place({ ...customer, name: '', items: [{ variantId, quantity: 1 }] }).expect(400);
    await place({ ...customer, addressLine: 'x', items: [{ variantId, quantity: 1 }] }).expect(400);
    await place({ ...customer, items: [] }).expect(400);
    await place({ ...customer, items: [{ variantId, quantity: 0 }] }).expect(400);
    expect(await stock()).toBe(2);
  });

  it('refuses to oversell', async () => {
    const res = await place({ ...customer, items: [{ variantId, quantity: 2 }, { variantId, quantity: 1 }] }).expect(409);
    expect(res.body.message).toMatch(/Only 2 left/);
    expect(await stock()).toBe(2);
  });

  it('does not sell draft products', async () => {
    const draft = await createProduct(m, { title: 'Draft', status: 'DRAFT' });
    await place({ ...customer, items: [{ variantId: draft.variants[0].id, quantity: 1 }] }).expect(409);
    await t.http().get(`/storefront/products/${draft.handle}`).set('Host', m.host).expect(404);
  });

  it('lets the customer confirm from the order link', async () => {
    const { body } = await place({ ...customer, items: [{ variantId, quantity: 1 }] }).expect(201);
    const confirmed = await t.http().post(`/storefront/orders/${body.token}/confirm`).set('Host', m.host).expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    // Idempotent.
    await t.http().post(`/storefront/orders/${body.token}/confirm`).set('Host', m.host).expect(200);

    const order = (await m.agent.get('/admin/orders?filter=confirmed')).body[0];
    const detail = await m.agent.get(`/admin/orders/${order.id}`).expect(200);
    expect(detail.body.confirmedVia).toBe('customer_link');
    expect(detail.body.events.map((e: any) => e.type)).toEqual(['placed', 'confirmed']);
    expect(detail.body.customerHistory.total).toBe(2);
  });

  it('restores stock when the customer cancels', async () => {
    const before = await stock();
    const { body } = await place({ ...customer, items: [{ variantId, quantity: 1 }] }).expect(201);
    expect(await stock()).toBe(before - 1);
    const cancelled = await t.http().post(`/storefront/orders/${body.token}/cancel`).set('Host', m.host).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(await stock()).toBe(before);
    await t.http().post(`/storefront/orders/${body.token}/confirm`).set('Host', m.host).expect(409);
  });

  it('runs the merchant fulfilment flow: confirm → ship → deliver', async () => {
    const pending = (await m.agent.get('/admin/orders?filter=pending')).body[0];
    await m.agent.post(`/admin/orders/${pending.id}/ship`).send({ courierName: 'PostEx', trackingNumber: 'PX123' }).expect(409);
    await m.agent.post(`/admin/orders/${pending.id}/confirm`).expect(200);
    await m.agent.post(`/admin/orders/${pending.id}/ship`).send({ courierName: 'PostEx' }).expect(400);
    const shipped = await m.agent.post(`/admin/orders/${pending.id}/ship`).send({ courierName: 'PostEx', trackingNumber: 'PX123' }).expect(200);
    expect(shipped.body).toMatchObject({ fulfillmentStatus: 'SHIPPED', trackingNumber: 'PX123' });
    await m.agent.post(`/admin/orders/${pending.id}/cancel`).expect(409);
    const delivered = await m.agent.post(`/admin/orders/${pending.id}/deliver`).expect(200);
    expect(delivered.body).toMatchObject({ fulfillmentStatus: 'DELIVERED', paymentStatus: 'PAID' });
  });

  it('restores stock when a shipped parcel is returned', async () => {
    const before = await stock();
    const confirmed = (await m.agent.get('/admin/orders?filter=confirmed')).body[0];
    await m.agent.post(`/admin/orders/${confirmed.id}/ship`).send({ courierName: 'Leopards', trackingNumber: 'LE99' }).expect(200);
    await m.agent.post(`/admin/orders/${confirmed.id}/return`).expect(200);
    expect(await stock()).toBe(before + confirmed.items.reduce((n: number, i: any) => n + i.quantity, 0));
    const summary = await m.agent.get('/admin/analytics/summary').expect(200);
    expect(summary.body).toMatchObject({ delivered: 1, returned: 1, cancelled: 1, collectedPaisa: 275_000 });
  });

  it('applies merchant settings: free shipping threshold and form text', async () => {
    const current = (await m.agent.get('/admin/settings').expect(200)).body;
    await m.agent
      .put('/admin/settings')
      .send({
        ...current,
        whatsappNumber: '0321-7654321',
        freeShippingOverPaisa: 200_000,
        codForm: { ...current.codForm, buttonText: 'Order karein', showEmail: true },
      })
      .expect(200);
    const store = await t.http().get('/storefront/store').set('Host', m.host).expect(200);
    expect(store.body.codForm.buttonText).toBe('Order karein');
    expect(store.body.whatsappNumber).toBe('923217654321');

    const { body } = await place({ ...customer, items: [{ variantId, quantity: 1 }] }).expect(201);
    const order = await t.http().get(`/storefront/orders/${body.token}`).set('Host', m.host).expect(200);
    expect(order.body.shippingPaisa).toBe(0);
    expect(order.body.totalPaisa).toBe(250_000);
    await m.agent.put('/admin/settings').send({ ...current, whatsappNumber: '12' }).expect(400);
  });
});

describe('storefront design settings', () => {
  let t: TestApp;
  let m: Merchant;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'design');
  });

  afterAll(() => t.app.close());

  it('serves the default design to new stores', async () => {
    const store = await t.http().get('/storefront/store').set('Host', m.host).expect(200);
    expect(store.body.theme).toMatchObject({ heroButtonText: 'Shop all', showRunway: true, accentColor: '#111111' });
    expect(store.body.theme.trustItems[1]).toMatchObject({ icon: 'cash', title: 'Cash on Delivery' });
  });

  it('saves and validates design settings', async () => {
    const current = (await m.agent.get('/admin/settings')).body;
    const theme = {
      ...current.theme,
      heroImageUrl: 'https://example.com/hero.jpg',
      announcements: ['Winter stock is live', 'Free delivery over Rs 5,000'],
      faq: [{ question: 'Can I open the parcel?', answer: 'Yes, check it before you pay.' }],
      trustItems: [{ icon: 'shield', title: 'Original', text: 'Checked before dispatch' }],
      deliveryEstimate: 'Delivery in 2–4 working days',
    };
    await m.agent.put('/admin/settings').send({ ...current, theme }).expect(200);
    const store = await t.http().get('/storefront/store').set('Host', m.host).expect(200);
    expect(store.body.theme).toMatchObject({
      heroImageUrl: 'https://example.com/hero.jpg',
      announcements: ['Winter stock is live', 'Free delivery over Rs 5,000'],
      deliveryEstimate: 'Delivery in 2–4 working days',
    });

    const bad = await m.agent.put('/admin/settings').send({ ...current, theme: { ...theme, heroImageUrl: 'not a url' } }).expect(400);
    expect(bad.body.field).toBe('theme.heroImageUrl');
    await m.agent.put('/admin/settings').send({ ...current, theme: { ...theme, trustItems: [{ icon: 'rocket', title: 'x', text: '' }] } }).expect(400);
  });

  it('upgrades stores saved with the earlier single announcement', async () => {
    await t.db.tenant(m.tenantId, (tx) =>
      tx.storeSettings.update({
        where: { tenantId: m.tenantId },
        data: { theme: { announcement: 'Old bar text', heroHeading: 'Old heading', accentColor: '#0f766e', heroImageUrl: 42 } },
      }),
    );
    const store = await t.http().get('/storefront/store').set('Host', m.host).expect(200);
    expect(store.body.theme).toMatchObject({ announcements: ['Old bar text'], heroHeading: 'Old heading', accentColor: '#0f766e', heroImageUrl: '' });
    expect(store.body.theme.announcement).toBeUndefined();
  });
});
