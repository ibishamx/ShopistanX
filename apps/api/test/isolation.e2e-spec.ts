import { PrismaClient } from '@prisma/client';
import { findUnprotectedTables } from '../scripts/check-rls';
import { Merchant, TestApp, createProduct, createTestApp, customer, registerMerchant } from './helpers';

/**
 * The two-tenant isolation suite: tenant B can never read or change tenant A's
 * rows through any endpoint, and the database refuses even if the API slips.
 */
describe('tenant isolation', () => {
  let t: TestApp;
  let a: Merchant;
  let b: Merchant;
  let productA: any;
  let orderA: { id: string; token: string };

  beforeAll(async () => {
    t = await createTestApp();
    a = await registerMerchant(t, 'iso-a');
    b = await registerMerchant(t, 'iso-b');
    productA = await createProduct(a, { title: 'Secret A Product', variants: [{ title: 'Default', sku: 'A-1', pricePaisa: 100_000, stock: 10 }] });
    const placed = await t
      .http()
      .post('/storefront/orders')
      .set('Host', a.host)
      .send({ ...customer, items: [{ variantId: productA.variants[0].id, quantity: 1 }] })
      .expect(201);
    const orders = await a.agent.get('/admin/orders').expect(200);
    orderA = { id: orders.body[0].id, token: placed.body.token };
  });

  afterAll(() => t.app.close());

  it('every table with tenant_id has forced row-level security', async () => {
    const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    expect(await findUnprotectedTables(owner)).toEqual([]);
    await owner.$disconnect();
  });

  it('merchant B cannot list tenant A data', async () => {
    expect((await b.agent.get('/admin/products').expect(200)).body).toEqual([]);
    expect((await b.agent.get('/admin/orders').expect(200)).body).toEqual([]);
    expect((await b.agent.get('/admin/customers').expect(200)).body).toEqual([]);
    expect((await b.agent.get('/admin/analytics/summary').expect(200)).body.orders).toBe(0);
  });

  it('merchant B cannot read, change or delete tenant A product by id', async () => {
    await b.agent.get(`/admin/products/${productA.id}`).expect(404);
    await b.agent
      .put(`/admin/products/${productA.id}`)
      .send({ title: 'Hacked', variants: [{ id: productA.variants[0].id, title: 'x', pricePaisa: 1, stock: 1 }] })
      .expect(404);
    await b.agent.delete(`/admin/products/${productA.id}`).expect(404);
    const still = await a.agent.get(`/admin/products/${productA.id}`).expect(200);
    expect(still.body.title).toBe('Secret A Product');
    expect(still.body.variants[0].pricePaisa).toBe(100_000);
  });

  it('merchant B cannot read or act on tenant A order', async () => {
    await b.agent.get(`/admin/orders/${orderA.id}`).expect(404);
    for (const action of ['confirm', 'cancel', 'deliver', 'return', 'whatsapp-confirmation']) {
      await b.agent.post(`/admin/orders/${orderA.id}/${action}`).send({}).expect((res) => expect([400, 404]).toContain(res.status));
    }
    const order = await a.agent.get(`/admin/orders/${orderA.id}`).expect(200);
    expect(order.body.status).toBe('PENDING');
  });

  it('storefront B does not serve tenant A products or orders', async () => {
    expect((await t.http().get('/storefront/products').set('Host', b.host).expect(200)).body).toEqual([]);
    await t.http().get(`/storefront/products/${productA.handle}`).set('Host', b.host).expect(404);
    await t.http().get(`/storefront/orders/${orderA.token}`).set('Host', b.host).expect(404);
    await t.http().post(`/storefront/orders/${orderA.token}/cancel`).set('Host', b.host).expect(404);
  });

  it('storefront B cannot sell tenant A variants', async () => {
    await t
      .http()
      .post('/storefront/orders')
      .set('Host', b.host)
      .send({ ...customer, items: [{ variantId: productA.variants[0].id, quantity: 1 }] })
      .expect(409);
    const product = await a.agent.get(`/admin/products/${productA.id}`).expect(200);
    expect(product.body.variants[0].stock).toBe(9);
  });

  it('the same SKU and phone can exist in two tenants', async () => {
    await createProduct(b, { variants: [{ title: 'Default', sku: 'A-1', pricePaisa: 100, stock: 1 }] });
  });

  it('unknown hosts resolve to no store', async () => {
    await t.http().get('/storefront/products').set('Host', 'nobody.shopistan.test').expect(404);
    await t.http().get('/storefront/products').set('X-Forwarded-Host', 'nobody.shopistan.test').expect(404);
  });

  it('a tenant-table query without a tenant fails instead of returning all rows', async () => {
    await expect(t.db.app.product.findMany()).rejects.toThrow();
    await expect(t.db.app.order.count()).rejects.toThrow();
  });

  it('the database rejects reads and writes across tenants even when the API is bypassed', async () => {
    const seen = await t.db.tenant(b.tenantId, (tx) => tx.product.findMany({ where: { id: productA.id } }));
    expect(seen).toEqual([]);
    const updated = await t.db.tenant(b.tenantId, (tx) => tx.product.updateMany({ where: { id: productA.id }, data: { title: 'x' } }));
    expect(updated.count).toBe(0);
    await expect(
      t.db.tenant(b.tenantId, (tx) => tx.product.create({ data: { tenantId: a.tenantId, title: 'planted', handle: 'planted' } })),
    ).rejects.toThrow(/row-level security/);
    // Composite foreign keys: a row in B cannot point at a product in A.
    await expect(
      t.db.tenant(b.tenantId, (tx) =>
        tx.productVariant.create({ data: { tenantId: b.tenantId, productId: productA.id, pricePaisa: 1 } }),
      ),
    ).rejects.toThrow();
  });

  it('the tenant-scoped database role cannot reach Super Admin tables', async () => {
    await expect(t.db.app.platformAdmin.findMany()).rejects.toThrow(/permission denied/);
    await expect(t.db.app.auditLog.findMany()).rejects.toThrow(/permission denied/);
    await expect(t.db.app.tenant.update({ where: { id: a.tenantId }, data: { status: 'ACTIVE' } })).rejects.toThrow(/permission denied/);
  });

  it('merchant routes require a session', async () => {
    for (const path of ['/admin/products', '/admin/orders', '/admin/settings', '/admin/whatsapp', '/admin/customers', '/auth/me']) {
      await t.http().get(path).expect(401);
    }
  });
});
