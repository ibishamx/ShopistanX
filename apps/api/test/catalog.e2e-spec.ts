import { Merchant, TestApp, createTestApp, registerMerchant } from './helpers';

const v = (pricePaisa: number, extra: Record<string, unknown> = {}) => ({ title: 'Default', pricePaisa, stock: 10, ...extra });

describe('catalog: product fields, search, collections, import', () => {
  let t: TestApp;
  let a: Merchant;
  let b: Merchant;
  const ids: Record<string, string> = {};

  const product = async (m: Merchant, body: Record<string, unknown>) => (await m.agent.post('/admin/products').send(body).expect(201)).body;
  const sf = (path: string, m: Merchant = a) => t.http().get(`/storefront${path}`).set('Host', m.host);

  beforeAll(async () => {
    t = await createTestApp();
    a = await registerMerchant(t, 'cat-a');
    b = await registerMerchant(t, 'cat-b');
    ids.khaddar = (await product(a, { title: 'Printed Khaddar 3 Piece', productType: 'Khaddar 3 Piece', vendor: 'IBX', tags: ['Khaddar', 'Winter', 'khaddar', ' '], seoTitle: 'Khaddar suit | IBX', seoDescription: 'Warm khaddar', variants: [v(315_000, { compareAtPaisa: 620_000, sku: 'K-016' })] })).id;
    ids.dhanak = (await product(a, { title: 'Embroidered Dhanak 2 Piece', productType: 'Dhanak 2 Piece', vendor: 'IBX', tags: ['Dhanak', 'Winter', 'Maroon'], variants: [v(265_000, { sku: 'D-023' })] })).id;
    ids.luxury = (await product(a, { title: 'Luxury Dhanak Shawl Suit', productType: 'Dhanak 3 Piece', vendor: 'Other Mill', tags: ['Dhanak', 'Luxury'], variants: [v(890_000)] })).id;
    ids.draft = (await product(a, { title: 'Draft Khaddar', status: 'DRAFT', productType: 'Khaddar 3 Piece', tags: ['Khaddar'], variants: [v(100_000)] })).id;
  });

  afterAll(() => t.app.close());

  it('stores type, vendor, de-duplicated tags and SEO fields', async () => {
    const p = (await a.agent.get(`/admin/products/${ids.khaddar}`).expect(200)).body;
    expect(p).toMatchObject({ productType: 'Khaddar 3 Piece', vendor: 'IBX', tags: ['Khaddar', 'Winter'], seoTitle: 'Khaddar suit | IBX' });
    const facets = (await a.agent.get('/admin/products/facets').expect(200)).body;
    expect(facets.types).toEqual(['Dhanak 2 Piece', 'Dhanak 3 Piece', 'Khaddar 3 Piece']);
    expect(facets.vendors).toEqual(['IBX', 'Other Mill']);
    expect(facets.tags).toContain('Luxury');
  });

  it('searches and filters products in the admin', async () => {
    const titles = async (qs: string) => (await a.agent.get(`/admin/products?${qs}`).expect(200)).body.map((p: any) => p.title).sort();
    expect(await titles('q=dhanak')).toEqual(['Embroidered Dhanak 2 Piece', 'Luxury Dhanak Shawl Suit']);
    expect(await titles('q=K-016')).toEqual(['Printed Khaddar 3 Piece']);
    expect(await titles('tag=Khaddar')).toEqual(['Draft Khaddar', 'Printed Khaddar 3 Piece']);
    expect(await titles('status=DRAFT')).toEqual(['Draft Khaddar']);
    expect(await titles('type=Dhanak%202%20Piece')).toEqual(['Embroidered Dhanak 2 Piece']);
    expect(await titles('vendor=Other%20Mill')).toEqual(['Luxury Dhanak Shawl Suit']);
  });

  it('builds automatic collections from rules', async () => {
    const preview = async (rules: unknown[], matchAll = true) => (await a.agent.post('/admin/collections/preview').send({ rules, matchAll }).expect(200)).body.count;
    expect(await preview([{ field: 'tag', relation: 'equals', value: 'khaddar' }])).toBe(2);
    expect(await preview([{ field: 'price', relation: 'less_than', value: '3,500' }])).toBe(3);
    expect(await preview([{ field: 'compare_at_price', relation: 'is_set' }])).toBe(1);
    expect(await preview([{ field: 'type', relation: 'starts_with', value: 'Dhanak' }, { field: 'vendor', relation: 'equals', value: 'IBX' }])).toBe(1);
    expect(await preview([{ field: 'tag', relation: 'equals', value: 'Luxury' }, { field: 'tag', relation: 'equals', value: 'Maroon' }], false)).toBe(2);
    expect(await preview([{ field: 'title', relation: 'not_contains', value: 'dhanak' }])).toBe(2);

    const bad = async (rules: unknown[]) => a.agent.post('/admin/collections').send({ title: 'Bad', kind: 'SMART', rules }).expect(400);
    await bad([]);
    await bad([{ field: 'price', relation: 'less_than', value: 'cheap' }]);
    await bad([{ field: 'price', relation: 'contains', value: '5' }]);
    await bad([{ field: 'tag', relation: 'equals', value: '' }]);

    const under = (await a.agent.post('/admin/collections').send({ title: 'Under Rs 3,500', kind: 'SMART', rules: [{ field: 'price', relation: 'less_than', value: '3500' }], sortOrder: 'price_asc', showInMenu: true, menuPosition: 2 }).expect(201)).body;
    expect(under.handle).toBe('under-rs-3-500');
    const sale = (await a.agent.post('/admin/collections').send({ title: 'Sale', kind: 'SMART', rules: [{ field: 'compare_at_price', relation: 'is_set' }], showInMenu: true, menuPosition: 1 }).expect(201)).body;
    ids.under = under.id;
    ids.sale = sale.id;

    const list = (await a.agent.get('/admin/collections').expect(200)).body;
    expect(list.find((c: any) => c.id === under.id).productCount).toBe(3); // the draft counts in the admin

    // A new product joins automatically.
    ids.cheap = (await product(a, { title: 'Cotton Lawn Suit', tags: ['Lawn'], variants: [v(199_000)] })).id;
    expect((await a.agent.get(`/admin/collections/${under.id}`).expect(200)).body.products).toHaveLength(4);
  });

  it('keeps manual collections in the order given', async () => {
    const res = await a.agent.post('/admin/collections').send({ title: 'Best Sellers', kind: 'MANUAL', productIds: [ids.luxury, ids.khaddar, ids.draft], sortOrder: 'manual' }).expect(201);
    ids.best = res.body.id;
    const detail = (await a.agent.get(`/admin/collections/${ids.best}`).expect(200)).body;
    expect(detail.products.map((p: any) => p.title)).toEqual(['Luxury Dhanak Shawl Suit', 'Printed Khaddar 3 Piece', 'Draft Khaddar']);
    await a.agent.post('/admin/collections').send({ title: 'Wrong', kind: 'SMART', rules: [{ field: 'tag', relation: 'equals', value: 'x' }], sortOrder: 'manual' }).expect(400);
  });

  it('serves collections, a menu and search on the storefront', async () => {
    const store = (await sf('/store').expect(200)).body;
    expect(store.menu).toEqual([{ title: 'Sale', handle: 'sale' }, { title: 'Under Rs 3,500', handle: 'under-rs-3-500' }]);

    const cols = (await sf('/collections').expect(200)).body;
    expect(cols.map((c: any) => c.title).sort()).toEqual(['Best Sellers', 'Sale', 'Under Rs 3,500']);
    expect(cols.find((c: any) => c.handle === 'best-sellers').productCount).toBe(2); // draft hidden

    const under = (await sf('/collections/under-rs-3-500').expect(200)).body;
    expect(under.products.map((p: any) => p.title)).toEqual(['Cotton Lawn Suit', 'Embroidered Dhanak 2 Piece', 'Printed Khaddar 3 Piece']);
    const desc = (await sf('/collections/under-rs-3-500?sort=price_desc').expect(200)).body;
    expect(desc.products[0].title).toBe('Printed Khaddar 3 Piece');
    expect((await sf('/collections/best-sellers').expect(200)).body.products.map((p: any) => p.title)).toEqual(['Luxury Dhanak Shawl Suit', 'Printed Khaddar 3 Piece']);

    await a.agent.put(`/admin/collections/${ids.best}`).send({ title: 'Best Sellers', kind: 'MANUAL', productIds: [ids.khaddar], published: false }).expect(200);
    await sf('/collections/best-sellers').expect(404);

    const search = async (q: string) => (await sf(`/search?q=${encodeURIComponent(q)}`).expect(200)).body.products.map((p: any) => p.title).sort();
    expect(await search('dhanak')).toEqual(['Embroidered Dhanak 2 Piece', 'Luxury Dhanak Shawl Suit']);
    expect(await search('maroon dhanak')).toEqual(['Embroidered Dhanak 2 Piece']);
    expect(await search('khaddar')).toEqual(['Printed Khaddar 3 Piece']); // draft excluded
    expect(await search('')).toEqual([]);

    const p = (await sf('/products/printed-khaddar-3-piece').expect(200)).body;
    expect(p).toMatchObject({ seoTitle: 'Khaddar suit | IBX', seoDescription: 'Warm khaddar', productType: 'Khaddar 3 Piece' });
  });

  it('keeps each store’s collections and products to itself', async () => {
    await b.agent.get(`/admin/collections/${ids.sale}`).expect(404);
    await b.agent.put(`/admin/collections/${ids.sale}`).send({ title: 'x', kind: 'SMART', rules: [{ field: 'tag', relation: 'equals', value: 'x' }] }).expect(404);
    expect((await b.agent.get('/admin/collections').expect(200)).body).toEqual([]);
    const mine = (await b.agent.post('/admin/collections').send({ title: 'Stolen', kind: 'MANUAL', productIds: [ids.khaddar, ids.dhanak] }).expect(201)).body;
    expect((await b.agent.get(`/admin/collections/${mine.id}`).expect(200)).body.products).toEqual([]);
    expect((await sf('/collections', b).expect(200)).body).toEqual([]);
    await sf('/collections/sale', b).expect(404);
    expect((await sf('/search?q=khaddar', b).expect(200)).body.products).toEqual([]);
  });

  it('imports products by handle, keeping long handles and existing variants', async () => {
    const longHandle = 'printed-khaddar-3-piece-suit-with-printed-dupatta-and-embroidered-neckline-ibx-k099';
    const item = (stock: number) => ({
      handle: longHandle,
      title: 'Printed Khaddar 3 Piece Suit – IBX-K099',
      description: '<p>Warm</p>',
      productType: 'Khaddar 3 Piece',
      vendor: 'IBX Collection',
      tags: ['Khaddar', 'Winter Collection'],
      seoTitle: 'K099 | IBX',
      images: ['https://cdn.example.com/k099-1.jpg', 'https://cdn.example.com/k099-2.jpg'],
      variants: [{ title: 'Default Title', sku: 'IBX-K099', pricePaisa: 315_000, compareAtPaisa: 620_000, stock }],
    });
    const first = (await a.agent.post('/admin/products/import').send({ products: [item(5), { ...item(1), handle: 'second-one', variants: [{ title: 'Default Title', sku: 'K-016', pricePaisa: 1, stock: 1 }] }] }).expect(200)).body;
    expect(first.created).toBe(1);
    expect(first.failed).toEqual([{ handle: 'second-one', result: 'failed', error: 'SKU "K-016" is already used by another product' }]);

    const list = (await a.agent.get(`/admin/products?q=K099`).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ handle: longHandle, vendor: 'IBX Collection', tags: ['Khaddar', 'Winter Collection'] });
    const variantId = list[0].variants[0].id;

    const again = (await a.agent.post('/admin/products/import').send({ products: [item(9)] }).expect(200)).body;
    expect(again).toMatchObject({ created: 0, updated: 1, failed: [] });
    const updated = (await a.agent.get(`/admin/products/${list[0].id}`).expect(200)).body;
    expect(updated.variants).toEqual([expect.objectContaining({ id: variantId, stock: 9 })]);
    await sf(`/products/${longHandle}`).expect(200);
  });
});

describe('variants that do not track stock', () => {
  let t: TestApp;
  let m: Merchant;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'untracked');
  });

  afterAll(() => t.app.close());

  it('stay on sale at zero stock and orders leave their stock alone', async () => {
    const p = (await m.agent.post('/admin/products').send({ title: 'Made to Order Suit', variants: [{ title: 'Default', pricePaisa: 300_000, stock: 0, trackInventory: false }] }).expect(201)).body;
    const sfp = (await t.http().get('/storefront/products/made-to-order-suit').set('Host', m.host).expect(200)).body;
    expect(sfp.variants[0]).toMatchObject({ available: true, maxQuantity: 20 });
    const order = await t.http().post('/storefront/orders').set('Host', m.host)
      .send({ name: 'Hina', phone: '0300 7778889', addressLine: 'House 1, Street 2, Saddar', landmark: 'Near Empress Market', city: 'Karachi', items: [{ variantId: p.variants[0].id, quantity: 3 }] })
      .expect(201);
    const orders = (await m.agent.get('/admin/orders')).body;
    await m.agent.post(`/admin/orders/${orders.find((o: any) => o.number === order.body.number).id}/cancel`).expect(200);
    expect((await m.agent.get(`/admin/products/${p.id}`)).body.variants[0]).toMatchObject({ stock: 0, trackInventory: false });
  });
});
