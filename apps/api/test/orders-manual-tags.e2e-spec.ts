import { Merchant, TestApp, createProduct, createTestApp, customer, placeOrder, registerMerchant } from './helpers';

describe('manual orders, tags, notes and search', () => {
  let t: TestApp;
  let m: Merchant;
  let other: Merchant;
  let suit: any;
  let shawl: any;
  let draft: any;

  const manual = (body: Record<string, unknown>, who: Merchant = m) =>
    who.agent.post('/admin/orders').send({
      name: 'Zainab Raza',
      phone: '0333 4445566',
      addressLine: 'House 9, Street 14, F-7/2',
      city: 'Islamabad',
      channel: 'instagram',
      items: [{ variantId: suit.variants[0].id, quantity: 2 }],
      ...body,
    });
  const detail = async (id: string) => (await m.agent.get(`/admin/orders/${id}`).expect(200)).body;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'manual');
    other = await registerMerchant(t, 'manual-other');
    suit = await createProduct(m, { title: 'Dhanak Suit', variants: [{ title: 'Default', pricePaisa: 300_000, stock: 10 }] });
    shawl = await createProduct(m, { title: 'Embroidered Shawl', variants: [{ title: 'Default', pricePaisa: 150_000, stock: 0, trackInventory: false }] });
    draft = await createProduct(m, { title: 'Draft Piece', status: 'DRAFT', variants: [{ title: 'Default', pricePaisa: 100_000, stock: 5 }] });
  });

  afterAll(() => t.app.close());

  it('creates a confirmed order from an Instagram chat with discount and delivery charge', async () => {
    const res = await manual({
      items: [{ variantId: suit.variants[0].id, quantity: 2 }, { variantId: shawl.variants[0].id, quantity: 1 }],
      shippingPaisa: 20_000,
      discountPaisa: 50_000,
      merchantNote: 'Customer wants delivery after 5pm',
      tags: ['VIP', 'vip', ' Eid '],
    }).expect(201);
    const d = await detail(res.body.id);
    expect(d).toMatchObject({
      source: 'manual',
      status: 'CONFIRMED',
      confirmedVia: 'confirmed_in_chat',
      subtotalPaisa: 750_000,
      shippingPaisa: 20_000,
      discountPaisa: 50_000,
      totalPaisa: 720_000,
      utmSource: 'instagram',
      utmMedium: 'manual',
      merchantNote: 'Customer wants delivery after 5pm',
      tags: ['VIP', 'Eid'],
      landmark: null,
    });
    expect(d.events.map((e: any) => e.message)[0]).toBe('Order entered by you (taken on Instagram)');
    expect((await m.agent.get(`/admin/products/${suit.id}`)).body.variants[0].stock).toBe(8);
    // The customer's page shows the discount.
    const pub = await t.http().get(`/storefront/orders/${d.publicToken}`).set('Host', m.host).expect(200);
    expect(pub.body).toMatchObject({ discountPaisa: 50_000, totalPaisa: 720_000, status: 'CONFIRMED' });
    expect(JSON.stringify(pub.body)).not.toContain('delivery after 5pm');
  });

  it('uses the store’s delivery rules when no charge is given, and can wait for confirmation', async () => {
    const res = await manual({ channel: 'whatsapp', alreadyConfirmed: false }).expect(201);
    const d = await detail(res.body.id);
    expect(d).toMatchObject({ status: 'PENDING', shippingPaisa: 25_000, totalPaisa: 625_000, utmSource: 'whatsapp' });
    expect(d.notifications).toEqual([]);
  });

  it('refuses a WhatsApp confirmation when WhatsApp is not connected, without creating the order', async () => {
    const before = (await m.agent.get('/admin/orders')).body.length;
    const res = await manual({ alreadyConfirmed: false, sendConfirmation: true }).expect(400);
    expect(res.body.message).toMatch(/Connect your WhatsApp Business account/);
    expect((await m.agent.get('/admin/orders')).body.length).toBe(before);
    expect((await m.agent.get(`/admin/products/${suit.id}`)).body.variants[0].stock).toBe(6);
  });

  it('validates manual orders', async () => {
    expect((await manual({ phone: '123' }).expect(400)).body.field).toBe('phone');
    await manual({ items: [] }).expect(400);
    await manual({ channel: 'carrier-pigeon' }).expect(400);
    expect((await manual({ discountPaisa: 9_000_000 }).expect(400)).body.field).toBe('discountPaisa');
    await manual({ items: [{ variantId: suit.variants[0].id, quantity: 99 }] }).expect(409);
    expect((await manual({ items: [{ variantId: draft.variants[0].id, quantity: 1 }] }).expect(409)).body.message).toMatch(/draft/);
    // Another store's product cannot be ordered.
    await manual({}, other).expect(409);
  });

  it('edits tags and notes, and filters by tag', async () => {
    const o = await placeOrder(t, m, suit.variants[0].id, { phone: '0300 5556667' });
    await m.agent.put(`/admin/orders/${o.id}/tags`).send({ tags: ['PostEx', 'COD-Confirmed', 'postex'] }).expect(200);
    await m.agent.put(`/admin/orders/${o.id}/note`).send({ note: '  Called twice, no answer  ' }).expect(200);
    expect(await detail(o.id)).toMatchObject({ tags: ['PostEx', 'COD-Confirmed'], merchantNote: 'Called twice, no answer' });
    await m.agent.put(`/admin/orders/${o.id}/note`).send({ note: '' }).expect(200);
    expect((await detail(o.id)).merchantNote).toBeNull();

    const tagged = (await m.agent.get('/admin/orders?tag=PostEx').expect(200)).body;
    expect(tagged.map((x: any) => x.id)).toEqual([o.id]);
    const tags = (await m.agent.get('/admin/orders/tags').expect(200)).body;
    expect(tags).toEqual(expect.arrayContaining([{ tag: 'PostEx', count: 1 }, { tag: 'VIP', count: 1 }]));
  });

  it('adds and removes tags on many orders at once', async () => {
    const all = (await m.agent.get('/admin/orders').expect(200)).body;
    const ids = all.map((o: any) => o.id);
    const res = await m.agent.post('/admin/orders/bulk-tags').send({ orderIds: ids, add: ['Week 48'], remove: ['vip'] }).expect(200);
    expect(res.body.updated).toBe(ids.length);
    const after = (await m.agent.get('/admin/orders?tag=Week%2048').expect(200)).body;
    expect(after).toHaveLength(ids.length);
    expect((await m.agent.get('/admin/orders?tag=VIP').expect(200)).body).toEqual([]);
    // Another store's ids are ignored.
    expect((await other.agent.post('/admin/orders/bulk-tags').send({ orderIds: ids, add: ['x'] }).expect(200)).body.updated).toBe(0);
  });

  it('searches by number, name, phone in any format, tracking and city', async () => {
    const o = await placeOrder(t, m, suit.variants[0].id, { phone: '0321 9876543', name: 'Mehwish Tariq', city: 'Multan' });
    await m.agent.post(`/admin/orders/${o.id}/confirm`).expect(200);
    await m.agent.post(`/admin/orders/${o.id}/ship`).send({ courierName: 'PostEx', trackingNumber: 'PX-2647823' }).expect(200);
    const find = async (q: string) => (await m.agent.get(`/admin/orders?q=${encodeURIComponent(q)}`).expect(200)).body.map((x: any) => x.id);
    for (const q of [`#${o.number}`, String(o.number), 'mehwish', '0321 9876543', '+92 321 9876543', '9876543', 'px-2647823', 'multan']) {
      expect(await find(q)).toContain(o.id);
    }
    expect(await find('nobody-here')).toEqual([]);
    expect((await other.agent.get('/admin/orders?q=mehwish').expect(200)).body).toEqual([]);
  });

  it('looks up a returning customer to fill in a manual order', async () => {
    const found = (await m.agent.get('/admin/customers/lookup?phone=0333-4445566').expect(200)).body;
    expect(found).toMatchObject({ name: 'Zainab Raza', city: 'Islamabad', addressLine: 'House 9, Street 14, F-7/2', orders: 2 });
    expect((await m.agent.get('/admin/customers/lookup?phone=0300 0000001').expect(200)).body).toEqual({});
    expect((await other.agent.get('/admin/customers/lookup?phone=03334445566').expect(200)).body).toEqual({});
  });

  it('keeps other stores out of tags and notes', async () => {
    const id = (await m.agent.get('/admin/orders')).body[0].id;
    await other.agent.put(`/admin/orders/${id}/tags`).send({ tags: ['hacked'] }).expect(404);
    await other.agent.put(`/admin/orders/${id}/note`).send({ note: 'hacked' }).expect(404);
    expect((await other.agent.get('/admin/orders/tags').expect(200)).body).toEqual([]);
    void customer;
  });
});
