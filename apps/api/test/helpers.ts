import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db/db.service';
import { WhatsappService } from '../src/whatsapp/whatsapp.service';

export interface TestApp {
  app: INestApplication;
  db: Db;
  whatsapp: WhatsappService;
  http: () => ReturnType<typeof request>;
  agent: () => ReturnType<typeof request.agent>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  return {
    app,
    db: app.get(Db),
    whatsapp: app.get(WhatsappService),
    http: () => request(app.getHttpServer()),
    agent: () => request.agent(app.getHttpServer()),
  };
}

export interface Merchant {
  agent: ReturnType<typeof request.agent>;
  slug: string;
  host: string;
  tenantId: string;
  email: string;
}

export async function registerMerchant(t: TestApp, label: string): Promise<Merchant> {
  const slug = `${label}-${randomBytes(4).toString('hex')}`;
  const email = `${slug}@example.com`;
  const agent = t.agent();
  await agent
    .post('/auth/register')
    .send({ name: `Owner ${label}`, email, password: 'correct-horse-1', storeName: `Store ${label}`, slug })
    .expect(201);
  const me = await agent.get('/auth/me').expect(200);
  return { agent, slug, host: `${slug}.shopistan.test`, tenantId: me.body.store.id, email };
}

export async function createProduct(m: Merchant, overrides: Record<string, unknown> = {}) {
  const res = await m.agent
    .post('/admin/products')
    .send({
      title: 'Lawn Suit',
      description: 'Three piece unstitched',
      images: ['https://example.com/suit.jpg'],
      variants: [{ title: 'Default', pricePaisa: 250_000, stock: 5 }],
      ...overrides,
    })
    .expect(201);
  return res.body;
}

export const customer = {
  name: 'Ayesha Khan',
  phone: '0300 1234567',
  addressLine: 'House 12, Street 4, Gulberg III',
  city: 'Lahore',
};
