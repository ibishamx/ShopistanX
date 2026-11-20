import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/crypto';
import { Merchant, TestApp, createProduct, createTestApp, customer, registerMerchant } from './helpers';

describe('Super Admin', () => {
  let t: TestApp;
  let m: Merchant;
  let admin: ReturnType<TestApp['agent']>;
  const email = `staff-${Date.now()}@shopistan.pk`;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'plat');
    await createProduct(m);
    await t.db.platform.platformAdmin.create({ data: { email, name: 'Staff', passwordHash: hashPassword('staff-password-1') } });
    admin = t.agent();
  });

  afterAll(() => t.app.close());

  it('is closed to anonymous users and to merchant sessions', async () => {
    await t.http().get('/platform/tenants').expect(401);
    await m.agent.get('/platform/tenants').expect(401);
    await m.agent.post(`/platform/tenants/${m.tenantId}/suspend`).send({ reason: 'self' }).expect(401);
    await t.http().post('/platform/auth/login').send({ email, password: 'wrong' }).expect(401);
    // A merchant login is not a staff login.
    await t.http().post('/platform/auth/login').send({ email: m.email, password: 'correct-horse-1' }).expect(401);
  });

  it('lists every store after staff login', async () => {
    await admin.post('/platform/auth/login').send({ email, password: 'staff-password-1' }).expect(200);
    const tenants = await admin.get('/platform/tenants').expect(200);
    const mine = tenants.body.find((x: any) => x.id === m.tenantId);
    expect(mine).toMatchObject({ slug: m.slug, status: 'TRIAL', products: 1, owner: { email: m.email } });
    // A staff session is not a merchant session.
    await admin.get('/admin/products').expect(401);
  });

  it('a suspended store stops serving and its admin is locked', async () => {
    await admin.post(`/platform/tenants/${m.tenantId}/suspend`).send({}).expect(400);
    await admin.post(`/platform/tenants/${m.tenantId}/suspend`).send({ reason: 'Selling counterfeit goods' }).expect(200);

    const store = await t.http().get('/storefront/store').set('Host', m.host).expect(503);
    expect(store.body.code).toBe('STORE_UNAVAILABLE');
    await t.http().get('/storefront/products').set('Host', m.host).expect(503);
    await t.http().post('/storefront/orders').set('Host', m.host).send({ ...customer, items: [] }).expect(503);
    const locked = await m.agent.get('/admin/products').expect(403);
    expect(locked.body.code).toBe('STORE_SUSPENDED');
  });

  it('reactivating restores service', async () => {
    await admin.post(`/platform/tenants/${m.tenantId}/reactivate`).expect(200);
    await t.http().get('/storefront/products').set('Host', m.host).expect(200);
    await m.agent.get('/admin/products').expect(200);
  });

  it('writes every action to an append-only audit log', async () => {
    const logs = (await admin.get('/platform/audit-logs').expect(200)).body.filter((l: any) => l.targetTenantId === m.tenantId);
    expect(logs.map((l: any) => l.action)).toEqual(['tenant.reactivate', 'tenant.suspend']);
    expect(logs[1]).toMatchObject({ actorEmail: email, detail: { before: 'TRIAL', after: 'SUSPENDED', reason: 'Selling counterfeit goods' } });

    const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    await expect(owner.auditLog.update({ where: { id: logs[0].id }, data: { action: 'edited' } })).rejects.toThrow(/append-only/);
    await expect(owner.auditLog.delete({ where: { id: logs[0].id } })).rejects.toThrow(/append-only/);
    await owner.$disconnect();
  });

  it('logout ends the staff session', async () => {
    await admin.post('/platform/auth/logout').expect(200);
    await admin.get('/platform/tenants').expect(401);
  });
});

describe('on-demand TLS check', () => {
  let t: TestApp;
  let m: Merchant;

  beforeAll(async () => {
    t = await createTestApp();
    m = await registerMerchant(t, 'tls');
  });

  afterAll(() => t.app.close());

  it('allows certificates only for store hostnames', async () => {
    await t.http().get('/internal/tls/allowed').query({ domain: m.host }).expect(200);
    await t.http().get('/internal/tls/allowed').query({ domain: m.host.toUpperCase() }).expect(200);
    await t.http().get('/internal/tls/allowed').query({ domain: 'random.shopistan.test' }).expect(404);
    await t.http().get('/internal/tls/allowed').query({ domain: 'evil.example.com' }).expect(404);
    await t.http().get('/internal/tls/allowed').expect(404);
  });
});
