import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { parse, slugify } from '../common/util';
import { Db, Tx } from '../db/db.service';

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(80),
  sku: z.string().trim().max(60).nullish(),
  pricePaisa: z.number().int().min(0).max(1_000_000_000),
  compareAtPaisa: z.number().int().min(0).max(1_000_000_000).nullish(),
  stock: z.number().int().min(0).max(1_000_000),
});

const productSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10_000).default(''),
  status: z.enum(['DRAFT', 'ACTIVE']).default('ACTIVE'),
  // Full URLs, or paths served by the storefront itself (e.g. /demo-img/a.jpg).
  images: z.array(z.union([z.string().trim().url().max(2000), z.string().trim().regex(/^\/[^\s/][^\s]*$/).max(2000)])).max(20).default([]),
  variants: z.array(variantSchema).min(1, 'Add at least one variant').max(100),
});
type ProductInput = z.infer<typeof productSchema>;

const include = {
  variants: { orderBy: { position: 'asc' as const } },
  images: { orderBy: { position: 'asc' as const } },
};

@Controller('admin/products')
@UseGuards(MerchantGuard)
export class ProductsController {
  constructor(private readonly db: Db) {}

  @Get()
  list(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, (tx) => tx.product.findMany({ include, orderBy: { createdAt: 'desc' } }));
  }

  @Get(':id')
  async get(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const product = await this.db.tenant(auth.tenantId, (tx) => tx.product.findUnique({ where: { id }, include }));
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  @Post()
  async create(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(productSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const handle = await this.freeHandle(tx, input.title);
      await this.assertSkusFree(tx, input, null);
      return tx.product.create({
        data: {
          tenantId: auth.tenantId,
          title: input.title,
          handle,
          description: input.description,
          status: input.status,
          images: { create: input.images.map((url, position) => ({ url, position })) },
          variants: {
            create: input.variants.map((v, position) => ({
              title: v.title,
              sku: v.sku || null,
              pricePaisa: v.pricePaisa,
              compareAtPaisa: v.compareAtPaisa ?? null,
              stock: v.stock,
              position,
            })),
          },
        },
        include,
      });
    });
  }

  @Put(':id')
  async update(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(productSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, include: { variants: true } });
      if (!existing) throw new NotFoundException('Product not found');
      await this.assertSkusFree(tx, input, id);

      const keep = new Set(input.variants.map((v) => v.id).filter(Boolean) as string[]);
      const existingIds = new Set(existing.variants.map((v) => v.id));
      await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: [...keep] } } });
      for (const [position, v] of input.variants.entries()) {
        const data = {
          title: v.title,
          sku: v.sku || null,
          pricePaisa: v.pricePaisa,
          compareAtPaisa: v.compareAtPaisa ?? null,
          stock: v.stock,
          position,
        };
        if (v.id && existingIds.has(v.id)) await tx.productVariant.update({ where: { id: v.id }, data });
        else await tx.productVariant.create({ data: { ...data, tenantId: auth.tenantId, productId: id } });
      }

      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.createMany({
        data: input.images.map((url, position) => ({ tenantId: auth.tenantId, productId: id, url, position })),
      });

      return tx.product.update({
        where: { id },
        data: { title: input.title, description: input.description, status: input.status },
        include,
      });
    });
  }

  @Delete(':id')
  async remove(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.db.tenant(auth.tenantId, (tx) => tx.product.deleteMany({ where: { id } }));
    if (!count) throw new NotFoundException('Product not found');
    return { ok: true };
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
