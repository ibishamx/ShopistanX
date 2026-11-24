import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { cleanHandle, parse, slugify } from '../common/util';
import { Db, Tx } from '../db/db.service';

// Full URLs, or paths served by the storefront itself (e.g. /demo-img/a.jpg).
const imageUrl = z.union([z.string().trim().url().max(2000), z.string().trim().regex(/^\/[^\s/][^\s]*$/).max(2000)]);

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(80),
  sku: z.string().trim().max(60).nullish(),
  pricePaisa: z.number().int().min(0).max(1_000_000_000),
  compareAtPaisa: z.number().int().min(0).max(1_000_000_000).nullish(),
  stock: z.number().int().min(0).max(1_000_000),
});

const tagsSchema = z
  .array(z.string().trim().max(60))
  .max(100)
  .default([])
  // Drop blanks and duplicates (ignoring case), keep the first spelling.
  .transform((tags) => tags.filter((t, i) => t && tags.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i));

const productSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(20_000).default(''),
  status: z.enum(['DRAFT', 'ACTIVE']).default('ACTIVE'),
  productType: z.string().trim().max(100).default(''),
  vendor: z.string().trim().max(100).default(''),
  tags: tagsSchema,
  seoTitle: z.string().trim().max(120).nullish(),
  seoDescription: z.string().trim().max(320).nullish(),
  images: z.array(imageUrl).max(30).default([]),
  variants: z.array(variantSchema).min(1, 'Add at least one variant').max(100),
});
type ProductInput = z.infer<typeof productSchema>;

const importSchema = z.object({
  products: z
    .array(productSchema.extend({ handle: z.string().trim().min(1).max(255) }))
    .min(1)
    .max(250, 'Import at most 250 products per request'),
});

export const productInclude = {
  variants: { orderBy: { position: 'asc' as const } },
  images: { orderBy: { position: 'asc' as const } },
};

function productData(input: ProductInput) {
  return {
    title: input.title,
    description: input.description,
    status: input.status,
    productType: input.productType,
    vendor: input.vendor,
    tags: input.tags,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
  };
}

function variantData(v: ProductInput['variants'][number], position: number) {
  return { title: v.title, sku: v.sku || null, pricePaisa: v.pricePaisa, compareAtPaisa: v.compareAtPaisa ?? null, stock: v.stock, position };
}

@Controller('admin/products')
@UseGuards(MerchantGuard)
export class ProductsController {
  constructor(private readonly db: Db) {}

  /** Search by title, SKU or tag; filter by status, type, vendor or tag. */
  @Get()
  list(
    @Auth() auth: MerchantAuth,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('vendor') vendor?: string,
    @Query('tag') tag?: string,
  ) {
    const term = q?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(status === 'ACTIVE' || status === 'DRAFT' ? { status } : {}),
      ...(type ? { productType: type } : {}),
      ...(vendor ? { vendor } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { handle: { contains: term, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
              { tags: { has: term } },
            ],
          }
        : {}),
    };
    return this.db.tenant(auth.tenantId, (tx) => tx.product.findMany({ where, include: productInclude, orderBy: { createdAt: 'desc' }, take: 500 }));
  }

  /** Values in use, for filters and suggestions. */
  @Get('facets')
  facets(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const rows = await tx.product.findMany({ select: { productType: true, vendor: true, tags: true } });
      const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
      return { types: uniq(rows.map((r) => r.productType)), vendors: uniq(rows.map((r) => r.vendor)), tags: uniq(rows.flatMap((r) => r.tags)) };
    });
  }

  @Get(':id')
  async get(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const product = await this.db.tenant(auth.tenantId, (tx) =>
      tx.product.findUnique({ where: { id }, include: { ...productInclude, collections: { include: { collection: { select: { id: true, title: true } } } } } }),
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  @Post()
  async create(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(productSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      await this.assertSkusFree(tx, input, null);
      return this.createProduct(tx, auth.tenantId, input, await this.freeHandle(tx, input.title));
    });
  }

  @Put(':id')
  async update(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(productSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, include: { variants: true } });
      if (!existing) throw new NotFoundException('Product not found');
      await this.assertSkusFree(tx, input, id);
      return this.updateProduct(tx, auth.tenantId, existing, input);
    });
  }

  @Delete(':id')
  async remove(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.db.tenant(auth.tenantId, (tx) => tx.product.deleteMany({ where: { id } }));
    if (!count) throw new NotFoundException('Product not found');
    return { ok: true };
  }

  /**
   * Bulk import (from a Shopify product CSV, converted in the browser).
   * Products are matched by handle: existing ones are updated, new ones
   * created, so running the same file twice is safe. Each product succeeds or
   * fails on its own.
   */
  @Post('import')
  @HttpCode(200)
  async import(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const { products } = parse(importSchema, body);
    const results: { handle: string; result: 'created' | 'updated' | 'failed'; error?: string }[] = [];
    for (const input of products) {
      const handle = cleanHandle(input.handle) || slugify(input.title) || 'product';
      try {
        const result = await this.db.tenant(auth.tenantId, async (tx) => {
          const existing = await tx.product.findFirst({ where: { handle }, include: { variants: true } });
          // Match variants by SKU, then by title, so stock and order history stay attached.
          const variants = input.variants.map((v) => {
            const match = existing?.variants.find((e) => (v.sku && e.sku === v.sku) || e.title === v.title);
            return { ...v, id: match?.id };
          });
          const withIds = { ...input, variants };
          await this.assertSkusFree(tx, withIds, existing?.id ?? null);
          if (existing) {
            await this.updateProduct(tx, auth.tenantId, existing, withIds);
            return 'updated' as const;
          }
          await this.createProduct(tx, auth.tenantId, withIds, handle);
          return 'created' as const;
        });
        results.push({ handle, result });
      } catch (e) {
        results.push({ handle, result: 'failed', error: (e as any)?.response?.message ?? (e as Error).message });
      }
    }
    return {
      created: results.filter((r) => r.result === 'created').length,
      updated: results.filter((r) => r.result === 'updated').length,
      failed: results.filter((r) => r.result === 'failed'),
    };
  }

  private createProduct(tx: Tx, tenantId: string, input: ProductInput, handle: string) {
    return tx.product.create({
      data: {
        tenantId,
        handle,
        ...productData(input),
        images: { create: input.images.map((url, position) => ({ url, position })) },
        variants: { create: input.variants.map((v, i) => variantData(v, i)) },
      },
      include: productInclude,
    });
  }

  private async updateProduct(tx: Tx, tenantId: string, existing: { id: string; variants: { id: string }[] }, input: ProductInput) {
    const id = existing.id;
    const keep = new Set(input.variants.map((v) => v.id).filter(Boolean) as string[]);
    const existingIds = new Set(existing.variants.map((v) => v.id));
    await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: [...keep] } } });
    for (const [position, v] of input.variants.entries()) {
      const data = variantData(v, position);
      if (v.id && existingIds.has(v.id)) await tx.productVariant.update({ where: { id: v.id }, data });
      else await tx.productVariant.create({ data: { ...data, tenantId, productId: id } });
    }
    await tx.productImage.deleteMany({ where: { productId: id } });
    await tx.productImage.createMany({ data: input.images.map((url, position) => ({ tenantId, productId: id, url, position })) });
    return tx.product.update({ where: { id }, data: productData(input), include: productInclude });
  }

  private async freeHandle(tx: Tx, title: string): Promise<string> {
    const base = slugify(title) || 'product';
    for (let i = 1; ; i++) {
      const handle = i === 1 ? base : `${base}-${i}`;
      if (!(await tx.product.findFirst({ where: { handle }, select: { id: true } }))) return handle;
    }
  }

  private async assertSkusFree(tx: Tx, input: ProductInput, productId: string | null) {
    const skus = input.variants.map((v) => v.sku).filter(Boolean) as string[];
    if (new Set(skus).size !== skus.length) throw new ConflictException('Each variant needs a different SKU');
    if (!skus.length) return;
    const clash = await tx.productVariant.findFirst({
      where: { sku: { in: skus }, ...(productId ? { productId: { not: productId } } : {}) },
    });
    if (clash) throw new ConflictException(`SKU "${clash.sku}" is already used by another product`);
  }
}
