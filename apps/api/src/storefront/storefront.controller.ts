import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, NotFoundException, Param, Post, Query, ServiceUnavailableException, UseGuards, createParamDecorator } from '@nestjs/common';
import { Order } from '@prisma/client';
import { Request } from 'express';
import { z } from 'zod';
import { formatPkMobile } from '../common/phone';
import { parse } from '../common/util';
import { Db, Tx } from '../db/db.service';
import { OrdersService, codOrderSchema } from '../orders/orders.service';
import { readCodForm, readTheme } from '../settings/defaults';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CollectionsService } from '../catalog/collections.service';
import { SORT_ORDERS, sortProducts } from '../catalog/collection-rules';

interface StoreContext {
  tenantId: string;
  name: string;
}

/** Storefront requests: the tenant comes from the request host, looked up in the domains table. */
@Injectable()
export class StoreHostGuard implements CanActivate {
  constructor(private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { store?: StoreContext }>();
    const raw = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
    const hostname = raw.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    let domain = hostname
      ? await this.db.app.domain.findUnique({ where: { hostname }, include: { tenant: true } })
      : null;
    // Development only: serve one store on any unknown host (e.g. a preview URL).
    // Never set STOREFRONT_FALLBACK_SLUG in production.
    const fallback = process.env.STOREFRONT_FALLBACK_SLUG;
    if (!domain && fallback) {
      domain = await this.db.app.domain.findFirst({ where: { tenant: { slug: fallback } }, include: { tenant: true } });
    }
    if (!domain || !domain.verified) throw new NotFoundException('Store not found');
    if (domain.tenant.status === 'SUSPENDED' || domain.tenant.status === 'DEACTIVATED') {
      throw new ServiceUnavailableException({ code: 'STORE_UNAVAILABLE', message: 'This store is currently unavailable.' });
    }
    req.store = { tenantId: domain.tenantId, name: domain.tenant.name };
    return true;
  }
}

const Store = createParamDecorator((_: unknown, context: ExecutionContext): StoreContext => {
  return context.switchToHttp().getRequest().store;
});

const productInclude = {
  variants: { orderBy: { position: 'asc' as const } },
  images: { orderBy: { position: 'asc' as const } },
};

function publicProduct(p: any) {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description,
    productType: p.productType,
    vendor: p.vendor,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    images: p.images.map((i: any) => i.url),
    variants: p.variants.map((v: any) => ({
      id: v.id,
      title: v.title,
      pricePaisa: v.pricePaisa,
      compareAtPaisa: v.compareAtPaisa,
      available: !v.trackInventory || v.stock > 0,
      maxQuantity: v.trackInventory ? Math.min(v.stock, 20) : 20,
    })),
  };
}

@Controller('storefront')
@UseGuards(StoreHostGuard)
export class StorefrontController {
  constructor(
    private readonly db: Db,
    private readonly orders: OrdersService,
    private readonly whatsapp: WhatsappService,
    private readonly collections: CollectionsService,
  ) {}

  @Get('store')
  async store(@Store() store: StoreContext) {
    const [settings, menu] = await this.db.tenant(store.tenantId, (tx) =>
      Promise.all([
        tx.storeSettings.findUniqueOrThrow({ where: { tenantId: store.tenantId } }),
        tx.collection.findMany({
          where: { published: true, showInMenu: true },
          orderBy: [{ menuPosition: 'asc' }, { title: 'asc' }],
          select: { title: true, handle: true },
        }),
      ]),
    );
    return {
      name: store.name,
      supportPhone: settings.supportPhone,
      whatsappNumber: settings.whatsappNumber,
      shippingFeePaisa: settings.shippingFeePaisa,
      freeShippingOverPaisa: settings.freeShippingOverPaisa,
      codForm: readCodForm(settings.codForm),
      theme: readTheme(settings.theme),
      menu,
    };
  }

  @Get('collections')
  async collectionList(@Store() store: StoreContext) {
    return this.db.tenant(store.tenantId, async (tx) => {
      const all = await tx.collection.findMany({ where: { published: true }, orderBy: [{ menuPosition: 'asc' }, { title: 'asc' }] });
      const counts = await this.collections.counts(tx, all, true);
      const result = [];
      for (const c of all) {
        const count = counts.get(c.id) ?? 0;
        if (!count) continue;
        // Without its own image, a collection shows its first product's photo.
        const image = c.imageUrl ?? (await this.collections.products(tx, c, { activeOnly: true })).find((p) => p.images[0])?.images[0]?.url ?? null;
        result.push({ title: c.title, handle: c.handle, image, productCount: count });
      }
      return result;
    });
  }

  @Get('collections/:handle')
  async collection(@Store() store: StoreContext, @Param('handle') handle: string, @Query('sort') sort?: string) {
    return this.db.tenant(store.tenantId, async (tx) => {
      const c = await tx.collection.findFirst({ where: { handle, published: true } });
      if (!c) throw new NotFoundException('Collection not found');
      const order = (SORT_ORDERS as readonly string[]).includes(sort ?? '') && !(sort === 'manual' && c.kind === 'SMART') ? sort : undefined;
      const products = await this.collections.products(tx, c, { activeOnly: true, sort: order });
      return {
        title: c.title,
        handle: c.handle,
        description: c.description,
        image: c.imageUrl,
        seoTitle: c.seoTitle,
        seoDescription: c.seoDescription,
        sortOrder: order ?? c.sortOrder,
        products: products.map(publicProduct),
      };
    });
  }

  @Get('search')
  async search(@Store() store: StoreContext, @Query('q') q?: string) {
    const term = (q ?? '').trim().slice(0, 100);
    if (!term) return { query: '', products: [] };
    const words = term.split(/\s+/).filter(Boolean).slice(0, 6);
    const products = await this.db.tenant(store.tenantId, (tx) =>
      tx.product.findMany({
        where: {
          status: 'ACTIVE',
          // Every word must appear in the title, type, vendor or a tag.
          AND: words.map((w) => ({
            OR: [
              { title: { contains: w, mode: 'insensitive' as const } },
              { productType: { contains: w, mode: 'insensitive' as const } },
              { vendor: { contains: w, mode: 'insensitive' as const } },
              { tags: { hasSome: [w, w.toLowerCase(), w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()] } },
            ],
          })),
        },
        include: productInclude,
        take: 60,
      }),
    );
    return { query: term, products: sortProducts(products, 'newest').map(publicProduct) };
  }

  @Get('products')
  async products(@Store() store: StoreContext) {
    const products = await this.db.tenant(store.tenantId, (tx) =>
      tx.product.findMany({ where: { status: 'ACTIVE' }, include: productInclude, orderBy: { createdAt: 'desc' } }),
    );
    return products.map(publicProduct);
  }

  @Get('products/:handle')
  async product(@Store() store: StoreContext, @Param('handle') handle: string) {
    const product = await this.db.tenant(store.tenantId, (tx) =>
      tx.product.findFirst({ where: { handle, status: 'ACTIVE' }, include: productInclude }),
    );
    if (!product) throw new NotFoundException('Product not found');
    return publicProduct(product);
  }

  /** The COD form and the cart checkout both post here. */
  @Post('orders')
  async placeOrder(@Store() store: StoreContext, @Body() body: unknown) {
    const order = await this.orders.placeCodOrder(store.tenantId, parse(codOrderSchema, body));
    return { token: order.publicToken, number: order.number };
  }

  @Get('orders/:token')
  getOrder(@Store() store: StoreContext, @Param('token') token: string) {
    return this.db.tenant(store.tenantId, async (tx) => this.publicOrder(tx, await this.orders.findOrThrow(tx, { publicToken: token })));
  }

  @Post('orders/:token/confirm')
  @HttpCode(200)
  confirm(@Store() store: StoreContext, @Param('token') token: string) {
    return this.db.tenant(store.tenantId, async (tx) => {
      const order = await this.orders.findOrThrow(tx, { publicToken: token });
      return this.publicOrder(tx, await this.orders.confirm(tx, order, 'customer', 'customer_link'));
    });
  }

  @Post('orders/:token/cancel')
  @HttpCode(200)
  cancel(@Store() store: StoreContext, @Param('token') token: string) {
    return this.db.tenant(store.tenantId, async (tx) => {
      const order = await this.orders.findOrThrow(tx, { publicToken: token });
      return this.publicOrder(tx, await this.orders.cancel(tx, order, 'customer', 'by customer'));
    });
  }

  private async publicOrder(tx: Tx, order: Order) {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    return {
      number: order.number,
      status: order.status,
      // The customer confirmed but the store wants to check first. The reason is not shown to the customer.
      customerConfirmed: order.status === 'PENDING' && !!order.customerConfirmedAt,
      fulfillmentStatus: order.fulfillmentStatus,
      customerName: order.customerName,
      phone: formatPkMobile(order.phone),
      addressLine: order.addressLine,
      landmark: order.landmark,
      city: order.city,
      subtotalPaisa: order.subtotalPaisa,
      shippingPaisa: order.shippingPaisa,
      totalPaisa: order.totalPaisa,
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      createdAt: order.createdAt,
      items: items.map((i) => ({ title: i.title, variantTitle: i.variantTitle, quantity: i.quantity, unitPricePaisa: i.unitPricePaisa })),
      whatsappConfirmUrl: await this.whatsapp.shopperConfirmUrl(tx, order),
    };
  }
}
