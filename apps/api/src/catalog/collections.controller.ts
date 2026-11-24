import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { cleanHandle, parse, slugify } from '../common/util';
import { Db, Tx } from '../db/db.service';
import { SORT_ORDERS, productMatches, ruleSchema } from './collection-rules';
import { CollectionsService } from './collections.service';

const imageUrl = z.union([z.literal(''), z.string().trim().url().max(2000), z.string().trim().regex(/^\/[^\s/][^\s]*$/).max(2000)]);

const collectionSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title').max(255),
    handle: z.string().trim().max(255).optional(),
    description: z.string().max(20_000).default(''),
    imageUrl: imageUrl.nullish(),
    kind: z.enum(['MANUAL', 'SMART']),
    rules: z.array(ruleSchema).max(60).default([]),
    matchAll: z.boolean().default(true),
    productIds: z.array(z.string().uuid()).max(5000).default([]),
    sortOrder: z.enum(SORT_ORDERS).default('newest'),
    published: z.boolean().default(true),
    showInMenu: z.boolean().default(false),
    menuPosition: z.number().int().min(0).max(1000).default(0),
    seoTitle: z.string().trim().max(120).nullish(),
    seoDescription: z.string().trim().max(320).nullish(),
  })
  .superRefine((c, ctx) => {
    if (c.kind === 'SMART' && !c.rules.length) ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Add at least one condition' });
    if (c.kind === 'SMART' && c.sortOrder === 'manual') ctx.addIssue({ code: 'custom', path: ['sortOrder'], message: 'Automatic collections cannot be sorted by hand' });
  });
type CollectionInput = z.infer<typeof collectionSchema>;

@Controller('admin/collections')
@UseGuards(MerchantGuard)
export class CollectionsController {
  constructor(
    private readonly db: Db,
    private readonly collections: CollectionsService,
  ) {}

  @Get()
  list(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const all = await tx.collection.findMany({ orderBy: [{ showInMenu: 'desc' }, { menuPosition: 'asc' }, { title: 'asc' }] });
      const counts = await this.collections.counts(tx, all);
      return all.map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
    });
  }

  @Get(':id')
  async get(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const c = await tx.collection.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Collection not found');
      const products = await this.collections.products(tx, c, { activeOnly: false });
      return {
        ...c,
        products: products.map((p) => ({ id: p.id, title: p.title, status: p.status, image: p.images[0]?.url ?? null, pricePaisa: Math.min(...p.variants.map((v) => v.pricePaisa)) })),
      };
    });
  }

  /** How many products a set of rules would include, before saving. */
  @Post('preview')
  @HttpCode(200)
  preview(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(z.object({ rules: z.array(ruleSchema).min(1).max(60), matchAll: z.boolean() }), body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const all = await tx.product.findMany({ include: { variants: true, images: { take: 1, orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'desc' } });
      const matched = all.filter((p) => productMatches(p, input.rules, input.matchAll));
      return { count: matched.length, sample: matched.slice(0, 8).map((p) => ({ id: p.id, title: p.title, image: p.images[0]?.url ?? null })) };
    });
  }

  @Post()
  create(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(collectionSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const handle = await this.freeHandle(tx, input.handle ? cleanHandle(input.handle) : slugify(input.title), null);
      const c = await tx.collection.create({ data: { tenantId: auth.tenantId, handle, ...this.data(input) } });
      await this.setProducts(tx, auth.tenantId, c.id, input);
      return c;
    });
  }

  @Put(':id')
  update(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(collectionSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const existing = await tx.collection.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Collection not found');
      const wanted = input.handle ? cleanHandle(input.handle) : existing.handle;
      if (wanted !== existing.handle && (await tx.collection.findFirst({ where: { handle: wanted, id: { not: id } } }))) {
        throw new ConflictException({ field: 'handle', message: 'Another collection already uses that web address' });
      }
      const c = await tx.collection.update({ where: { id }, data: { handle: wanted || existing.handle, ...this.data(input) } });
      await this.setProducts(tx, auth.tenantId, id, input);
      return c;
    });
  }

  @Delete(':id')
  async remove(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.db.tenant(auth.tenantId, (tx) => tx.collection.deleteMany({ where: { id } }));
    if (!count) throw new NotFoundException('Collection not found');
    return { ok: true };
  }

  private data(input: CollectionInput) {
    return {
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl || null,
      kind: input.kind,
      rules: input.kind === 'SMART' ? input.rules : [],
      matchAll: input.matchAll,
      sortOrder: input.sortOrder,
      published: input.published,
      showInMenu: input.showInMenu,
      menuPosition: input.menuPosition,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    };
  }

  /** Manual collections: replace the product list (order = position). Ids from another store are ignored by RLS. */
  private async setProducts(tx: Tx, tenantId: string, collectionId: string, input: CollectionInput) {
    await tx.collectionProduct.deleteMany({ where: { collectionId } });
    if (input.kind !== 'MANUAL' || !input.productIds.length) return;
    const ids = [...new Set(input.productIds)];
    const found = new Set((await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id));
    await tx.collectionProduct.createMany({
      data: ids.filter((id) => found.has(id)).map((productId, position) => ({ tenantId, collectionId, productId, position })),
    });
  }

  private async freeHandle(tx: Tx, base: string, exceptId: string | null): Promise<string> {
    const root = base || 'collection';
    for (let i = 1; ; i++) {
      const handle = i === 1 ? root : `${root}-${i}`;
      if (!(await tx.collection.findFirst({ where: { handle, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }))) return handle;
    }
  }
}
