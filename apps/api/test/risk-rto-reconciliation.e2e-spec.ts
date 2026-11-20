import { Merchant, TestApp, createProduct, createTestApp, fulfil, placeOrder, registerMerchant } from './helpers';

const phoneOf = (n: number) => `0301 ${String(n).padStart(7, '0')}`;
let phoneSeq = Math.floor(Math.random() * 9_000_000);
const freshPhone = () => phoneOf(++phoneSeq);

describe('shared risk score and order rules', () => {
  let t: TestApp;
  let a: Merchant;
  let b: Merchant;
  let variantA: string;
  let variantB: string;

  const setRules = async (m: Merchant, rules: Record<string, unknown>) => {
    const current = (await m.agent.get('/admin/settings')).body;
    await m.agent.put('/admin/settings').send({ ...current, orderRules: { ...current.orderRules, ...rules } }).expect(200);
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await registerMerchant(t, 'risk-a');
    b = await registerMerchant(t, 'risk-b');
    variantA = (await createProduct(a, { variants: [{ title: 'Default', pricePaisa: 250_000, stock: 100 }] })).variants[0].id;
    variantB = (await createProduct(b, { variants: [{ title: 'Default', pricePaisa: 250_000, stock: 100 }] })).variants[0].id;
  });

  afterAll(() => t.app.close());

  it('scores a new phone number as new and does not hold it by default', async () => {
    const o = await placeOrder(t, b, variantB, { phone: freshPhone() });
    const d = (await b.agent.get(`/admin/orders/${o.id}`)).body;
    expect(d).toMatchObject({ riskLevel: 'new', onHold: false, status: 'PENDING' });
    expect(d.riskDetail.summary).toBe('No delivery history on Shopistan yet');
  });

  it('holds a customer who refused parcels in another store, without revealing that store', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 2; i++) await fulfil(a, (await placeOrder(t, a, variantA, { phone })).id, 'return');

    const o = await placeOrder(t, b, variantB, { phone });
    const d = (await b.agent.get(`/admin/orders/${o.id}`)).body;
    expect(d).toMatchObject({ riskLevel: 'risky', onHold: true, status: 'PENDING' });
    expect(d.riskDetail).toMatchObject({ thisStore: { delivered: 0, returned: 0 }, otherStores: { stores: 1, delivered: 0, returned: 2 } });
    expect(d.holdReason).toContain('refused 2');
    expect(d.events.map((e: any) => e.type)).toEqual(['placed', 'held']);
    // Only totals cross stores: nothing identifying store A appears in B's order.
    const text = JSON.stringify(d);
    expect(text).not.toContain(a.slug);
    expect(text).not.toContain(a.tenantId);
    expect(text).not.toContain('Store risk-a');

    const held = await b.agent.get('/admin/orders?filter=held').expect(200);
    expect(held.body.map((x: any) => x.id)).toContain(o.id);
  });

  it('records a held customer’s confirmation but waits for the merchant', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 2; i++) await fulfil(a, (await placeOrder(t, a, variantA, { phone })).id, 'return');
    const o = await placeOrder(t, b, variantB, { phone });

    const pub = await t.http().post(`/storefront/orders/${o.token}/confirm`).set('Host', b.host).expect(200);
    expect(pub.body).toMatchObject({ status: 'PENDING', customerConfirmed: true });
    expect(JSON.stringify(pub.body)).not.toMatch(/risk|refused|hold/i);

    await b.agent.post(`/admin/orders/${o.id}/ship`).send({ courierName: 'PostEx', trackingNumber: 'X100' }).expect(409);
    const confirmed = await b.agent.post(`/admin/orders/${o.id}/confirm`).expect(200);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', onHold: false });
    const d = (await b.agent.get(`/admin/orders/${o.id}`)).body;
    expect(d.events.map((e: any) => e.type)).toEqual(['placed', 'held', 'customer_confirmed', 'released', 'confirmed']);
  });

  it('can turn off holding risky customers', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 2; i++) await fulfil(a, (await placeOrder(t, a, variantA, { phone })).id, 'return');
    await setRules(b, { holdRisky: false });
    const o = await placeOrder(t, b, variantB, { phone });
    expect((await b.agent.get(`/admin/orders/${o.id}`)).body).toMatchObject({ riskLevel: 'risky', onHold: false });
    await setRules(b, { holdRisky: true });
  });

  it('auto-confirms trusted customers when the rule is on', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 2; i++) await fulfil(a, (await placeOrder(t, a, variantA, { phone })).id, 'deliver');

    const before = await placeOrder(t, b, variantB, { phone });
    expect((await b.agent.get(`/admin/orders/${before.id}`)).body).toMatchObject({ riskLevel: 'trusted', status: 'PENDING' });

    await setRules(b, { autoConfirmTrusted: true });
    const o = await placeOrder(t, b, variantB, { phone });
    const d = (await b.agent.get(`/admin/orders/${o.id}`)).body;
    expect(d).toMatchObject({ riskLevel: 'trusted', status: 'CONFIRMED', confirmedVia: 'auto_trusted', onHold: false });
    expect(d.events.map((e: any) => e.type)).toEqual(['placed', 'confirmed', 'rule']);
    await setRules(b, { autoConfirmTrusted: false });
  });

  it('holds large first orders over the merchant’s limit', async () => {
    await setRules(b, { holdNewOverPaisa: 500_000 });
    const small = await placeOrder(t, b, variantB, { phone: freshPhone() });
    expect((await b.agent.get(`/admin/orders/${small.id}`)).body.onHold).toBe(false);
    const big = await placeOrder(t, b, variantB, { phone: freshPhone(), items: [{ variantId: variantB, quantity: 2 }] });
    const d = (await b.agent.get(`/admin/orders/${big.id}`)).body;
    expect(d).toMatchObject({ onHold: true, holdReason: 'New customer with an order of Rs 5,250' });
    await setRules(b, { holdNewOverPaisa: null });
    await b.agent.put('/admin/settings').send({ ...(await b.agent.get('/admin/settings')).body, orderRules: { holdRisky: 'yes' } }).expect(400);
  });

  it('requires a landmark when the form asks for it', async () => {
    const res = await t.http().post('/storefront/orders').set('Host', b.host)
      .send({ name: 'Ali', phone: freshPhone(), addressLine: 'House 1, Street 2, Model Town', city: 'Lahore', items: [{ variantId: variantB, quantity: 1 }] })
      .expect(400);
    expect(res.body.field).toBe('landmark');

    const current = (await b.agent.get('/admin/settings')).body;
    await b.agent.put('/admin/settings').send({ ...current, codForm: { ...current.codForm, showLandmark: false } }).expect(200);
    await t.http().post('/storefront/orders').set('Host', b.host)
      .send({ name: 'Ali', phone: freshPhone(), addressLine: 'House 1, Street 2, Model Town', city: 'Lahore', items: [{ variantId: variantB, quantity: 1 }] })
      .expect(201);
    await b.agent.put('/admin/settings').send(current).expect(200);
  });
});

describe('RTO analytics', () => {
  let t: TestApp;
  let m: Merchant;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'rto');
    const suit = (await createProduct(m, { title: 'Lawn Suit', variants: [{ title: 'Default', pricePaisa: 300_000, stock: 50 }] })).variants[0].id;
    const shawl = (await createProduct(m, { title: 'Shawl', variants: [{ title: 'Default', pricePaisa: 100_000, stock: 50 }] })).variants[0].id;
    const fb = { utm: { source: 'facebook', campaign: 'winter-sale' } };
    const plan: [string, string, Record<string, unknown>, 'deliver' | 'return', string][] = [
      [suit, 'Karachi', fb, 'return', 'Leopards'],
      [suit, 'Karachi', fb, 'return', 'Leopards'],
      [suit, 'Lahore', fb, 'deliver', 'PostEx'],
      [shawl, 'Lahore', {}, 'deliver', 'PostEx'],
      [shawl, 'lahore ', {}, 'deliver', 'PostEx'],
    ];
    for (const [variantId, city, extra, outcome, courier] of plan) {
      const o = await placeOrder(t, m, variantId, { city, phone: freshPhone(), ...extra });
      await fulfil(m, o.id, outcome, `T-${o.number}`, courier);
    }
    await placeOrder(t, m, suit, { phone: freshPhone() }); // still open: excluded
  });

  afterAll(() => t.app.close());

  it('breaks returns down by city, courier, product, campaign and hour', async () => {
    const { body } = await m.agent.get('/admin/analytics/rto?days=30').expect(200);
    expect(body.totals).toMatchObject({ delivered: 3, returned: 2, returnRate: 0.4, returnedValuePaisa: 650_000 });
    const rows = (dim: string) => Object.fromEntries(body.breakdowns[dim].rows.map((r: any) => [r.key, r]));
    expect(rows('city').Karachi).toMatchObject({ delivered: 0, returned: 2, returnRate: 1 });
    expect(rows('city').Lahore).toMatchObject({ delivered: 3, returned: 0 }); // "lahore " grouped with "Lahore"
    expect(rows('courier').Leopards.returned).toBe(2);
    expect(rows('product')['Lawn Suit']).toMatchObject({ delivered: 1, returned: 2, returnedValuePaisa: 600_000 });
    expect(rows('campaign')['facebook / winter-sale']).toMatchObject({ delivered: 1, returned: 2 });
    expect(rows('campaign')['Direct / unknown']).toMatchObject({ delivered: 2, returned: 0 });
    const hours = body.breakdowns.hour.rows;
    expect(hours.reduce((n: number, r: any) => n + r.delivered + r.returned, 0)).toBe(5);
    expect(hours[0].key).toMatch(/^\d\d:00$/);
    expect(body.breakdowns.risk.rows.length).toBeGreaterThan(0);
  });
});

describe('COD reconciliation', () => {
  let t: TestApp;
  let m: Merchant;
  let other: Merchant;
  const delivered: { id: string; tracking: string; total: number }[] = [];
  let shippedTracking: string;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'recon');
    other = await registerMerchant(t, 'recon-other');
    const v = (await createProduct(m, { variants: [{ title: 'Default', pricePaisa: 200_000, stock: 50 }] })).variants[0].id;
    for (let i = 0; i < 4; i++) {
      const o = await placeOrder(t, m, v, { phone: freshPhone() });
      const tracking = `PX-${o.number}`;
      await fulfil(m, o.id, 'deliver', tracking);
      delivered.push({ id: o.id, tracking, total: 225_000 });
    }
    const s = await placeOrder(t, m, v, { phone: freshPhone() });
    await m.agent.post(`/admin/orders/${s.id}/confirm`).expect(200);
    shippedTracking = `PX-${s.number}`;
    await m.agent.post(`/admin/orders/${s.id}/ship`).send({ courierName: 'PostEx', trackingNumber: shippedTracking }).expect(200);
  });

  afterAll(() => t.app.close());

  it('lists every delivered order as unpaid before any report is imported', async () => {
    const { body } = await m.agent.get('/admin/reconciliation/unpaid').expect(200);
    expect(body.orders).toHaveLength(4);
    expect(body.outstandingPaisa).toBe(900_000);
    expect(body.orders[0]).toMatchObject({ late: false, daysSinceDelivery: 0, courierName: 'PostEx' });
  });

  it('matches a courier report line by line', async () => {
    const res = await m.agent
      .post('/admin/reconciliation/settlements')
      .send({
        courierName: 'PostEx',
        reference: 'Payment 14 Nov',
        fileName: 'postex-14nov.csv',
        lines: [
          { trackingNumber: delivered[0].tracking, amountPaisa: 225_000 },
          { trackingNumber: ` ${delivered[1].tracking.toLowerCase()} `, amountPaisa: 200_000 },
          { trackingNumber: delivered[0].tracking, amountPaisa: 225_000 },
          { trackingNumber: shippedTracking, amountPaisa: 225_000 },
          { trackingNumber: 'NOT-OURS-1', amountPaisa: 99_000 },
        ],
      })
      .expect(201);
    expect(res.body.counts).toEqual({ MATCHED: 1, AMOUNT_MISMATCH: 1, DUPLICATE: 1, NOT_DELIVERED: 1, UNKNOWN_TRACKING: 1 });

    const detail = await m.agent.get(`/admin/reconciliation/settlements/${res.body.id}`).expect(200);
    expect(detail.body).toMatchObject({ courierName: 'PostEx', reference: 'Payment 14 Nov', totalPaisa: 974_000 });
    const mismatch = detail.body.lines.find((l: any) => l.match === 'AMOUNT_MISMATCH');
    expect(mismatch.order).toMatchObject({ id: delivered[1].id, totalPaisa: 225_000 });

    const unpaid = (await m.agent.get('/admin/reconciliation/unpaid').expect(200)).body;
    expect(unpaid.orders.map((o: any) => o.id).sort()).toEqual([delivered[2].id, delivered[3].id].sort());
    expect(unpaid).toMatchObject({ outstandingPaisa: 450_000, remittedPaisa: 425_000, shortfallPaisa: 25_000 });
  });

  it('flags a re-imported report as duplicates', async () => {
    const res = await m.agent
      .post('/admin/reconciliation/settlements')
      .send({ courierName: 'PostEx', reference: 'Same file again', lines: [{ trackingNumber: delivered[0].tracking, amountPaisa: 225_000 }] })
      .expect(201);
    expect(res.body.counts.DUPLICATE).toBe(1);
    const list = (await m.agent.get('/admin/reconciliation/settlements').expect(200)).body;
    expect(list).toHaveLength(2);
  });

  it('validates the import', async () => {
    await m.agent.post('/admin/reconciliation/settlements').send({ courierName: 'PostEx', reference: 'x', lines: [] }).expect(400);
    await m.agent.post('/admin/reconciliation/settlements').send({ courierName: 'PostEx', reference: 'x', lines: [{ trackingNumber: 'A', amountPaisa: -5 }] }).expect(400);
  });

  it('keeps each store’s reports and orders to itself', async () => {
    const mine = (await m.agent.get('/admin/reconciliation/settlements')).body[0];
    await other.agent.get(`/admin/reconciliation/settlements/${mine.id}`).expect(404);
    expect((await other.agent.get('/admin/reconciliation/settlements')).body).toEqual([]);
    const res = await other.agent
      .post('/admin/reconciliation/settlements')
      .send({ courierName: 'PostEx', reference: 'probe', lines: [{ trackingNumber: delivered[3].tracking, amountPaisa: 225_000 }] })
      .expect(201);
    expect(res.body.counts.UNKNOWN_TRACKING).toBe(1);
    expect((await m.agent.get('/admin/reconciliation/unpaid')).body.orders).toHaveLength(2);
  });
});
