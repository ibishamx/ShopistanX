import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, NotFoundException, Param, Post, ServiceUnavailableException, UseGuards, createParamDecorator } from '@nestjs/common';
import { Order } from '@prisma/client';
import { Request } from 'express';
import { z } from 'zod';
import { formatPkMobile } from '../common/phone';
import { parse } from '../common/util';
import { Db, Tx } from '../db/db.service';
import { OrdersService, codOrderSchema } from '../orders/orders.service';
import { readCodForm, readTheme } from '../settings/defaults';
import { WhatsappService } from '../whatsapp/whatsapp.service';

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
    const domain = hostname
      ? await this.db.app.domain.findUnique({ where: { hostname }, include: { tenant: true } })
      : null;
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
    images: p.images.map((i: any) => i.url),
    variants: p.variants.map((v: any) => ({
      id: v.id,
      title: v.title,
      pricePaisa: v.pricePaisa,
      compareAtPaisa: v.compareAtPaisa,
      available: v.stock > 0,
      maxQuantity: Math.min(v.stock, 20),
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
  ) {}

  @Get('store')
  async store(@Store() store: StoreContext) {
    const settings = await this.db.tenant(store.tenantId, (tx) =>
      tx.storeSettings.findUniqueOrThrow({ where: { tenantId: store.tenantId } }),
    );
    return {
      name: store.name,
      supportPhone: settings.supportPhone,
      whatsappNumber: settings.whatsappNumber,
      shippingFeePaisa: settings.shippingFeePaisa,
      freeShippingOverPaisa: settings.freeShippingOverPaisa,
      codForm: readCodForm(settings.codForm),
      theme: readTheme(settings.theme),
    };
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
      fulfillmentStatus: order.fulfillmentStatus,
      customerName: order.customerName,
      phone: formatPkMobile(order.phone),
      addressLine: order.addressLine,
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
