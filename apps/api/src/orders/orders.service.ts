import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Order } from '@prisma/client';
import { z } from 'zod';
import { randomToken } from '../common/crypto';
import { normalizePkMobile } from '../common/phone';
import { Db, Tx } from '../db/db.service';
import { RiskService, decide, readOrderRules } from '../risk/risk.service';
import { readCodForm } from '../settings/defaults';
import { WhatsappService } from '../whatsapp/whatsapp.service';

export const codOrderSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(20) }))
    .min(1, 'Your cart is empty')
    .max(50),
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  phone: z.string().trim().min(1, 'Enter your mobile number').max(20),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200).optional().or(z.literal('')),
  addressLine: z.string().trim().min(8, 'Enter your complete address').max(300),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, 'Enter your city').max(60),
  notes: z.string().trim().max(500).optional(),
  source: z.enum(['cod_form', 'cart']).default('cod_form'),
  utm: z
    .object({
      source: z.string().trim().max(100).optional(),
      medium: z.string().trim().max(100).optional(),
      campaign: z.string().trim().max(150).optional(),
    })
    .optional(),
});
export type CodOrderInput = z.infer<typeof codOrderSchema>;

export const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  phone: 'a phone call',
  walk_in: 'a shop visit',
  other: 'another channel',
};

export const manualOrderSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(500) })).min(1, 'Add at least one product').max(100),
  name: z.string().trim().min(2, 'Enter the customer’s name').max(80),
  phone: z.string().trim().min(1, 'Enter the customer’s mobile number').max(20),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('')),
  addressLine: z.string().trim().min(5, 'Enter the delivery address').max(300),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  notes: z.string().trim().max(500).optional(),
  channel: z.enum(['whatsapp', 'instagram', 'facebook', 'tiktok', 'phone', 'walk_in', 'other']),
  /** Null or missing: use the store's delivery charge rules. */
  shippingPaisa: z.number().int().min(0).max(10_000_000).nullish(),
  discountPaisa: z.number().int().min(0).max(1_000_000_000).default(0),
  alreadyConfirmed: z.boolean().default(true),
  sendConfirmation: z.boolean().default(false),
  merchantNote: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
});
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;

interface CreateOptions {
  kind: 'storefront' | 'manual';
  channel?: string;
  shippingPaisa?: number | null;
  discountPaisa?: number;
  alreadyConfirmed?: boolean;
  sendConfirmation?: boolean;
  merchantNote?: string | null;
  tags?: string[];
}

export type Actor = 'customer' | 'merchant' | 'whatsapp' | 'system';

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: Db,
    private readonly whatsapp: WhatsappService,
    private readonly risk: RiskService,
  ) {}

  /** Places a cash-on-delivery order from the storefront. Prices and totals are computed here, never taken from the client. */
  placeCodOrder(tenantId: string, input: CodOrderInput): Promise<Order> {
    return this.createOrder(tenantId, input, { kind: 'storefront' });
  }

  /**
   * An order the merchant enters for a sale agreed in a chat or on the phone.
   * Same stock, numbering, risk and rules as storefront orders; the merchant
   * may set the delivery charge and a discount, and mark it already confirmed.
   */
  createManualOrder(tenantId: string, input: ManualOrderInput): Promise<Order> {
    return this.createOrder(
      tenantId,
      { ...input, source: 'cod_form', utm: { source: input.channel, medium: 'manual' } },
      {
        kind: 'manual',
        channel: input.channel,
        shippingPaisa: input.shippingPaisa ?? null,
        discountPaisa: input.discountPaisa,
        alreadyConfirmed: input.alreadyConfirmed,
        sendConfirmation: input.sendConfirmation,
        merchantNote: input.merchantNote || null,
        tags: input.tags,
      },
    );
  }

  private async createOrder(tenantId: string, input: CodOrderInput, opts: CreateOptions): Promise<Order> {
    const manual = opts.kind === 'manual';
    const phone = normalizePkMobile(input.phone);
    if (!phone) {
      throw new BadRequestException({ field: 'phone', message: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567' });
    }

    // The customer's platform-wide record, read before the order transaction.
    const risk = await this.risk.forPhone(tenantId, phone);

    // Merge duplicate lines so stock is checked against the full quantity.
    const quantities = new Map<string, number>();
    for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);

    const { order, notificationId } = await this.db.tenant(tenantId, async (tx) => {
      const variants = await tx.productVariant.findMany({
        where: { id: { in: [...quantities.keys()] }, product: { status: 'ACTIVE' } },
        include: { product: true },
      });
      if (variants.length !== quantities.size) {
        throw new ConflictException(manual ? 'One of the products is a draft or was deleted. Make it active first.' : 'One of the products in your order is no longer available');
      }

      let subtotalPaisa = 0;
      for (const variant of variants) {
        const quantity = quantities.get(variant.id)!;
        // Conditional decrement: two shoppers cannot both take the last unit.
        // Variants that do not track stock are always available.
        const { count } = variant.trackInventory
          ? await tx.productVariant.updateMany({
              where: { id: variant.id, stock: { gte: quantity } },
              data: { stock: { decrement: quantity } },
            })
          : { count: 1 };
        if (!count) {
          const name = variant.title === 'Default' ? variant.product.title : `${variant.product.title} (${variant.title})`;
          throw new ConflictException(variant.stock > 0 ? `Only ${variant.stock} left of ${name}` : `${name} is out of stock`);
        }
        subtotalPaisa += variant.pricePaisa * quantity;
      }

      // Row lock on store_settings makes order numbers sequential per store.
      const settings = await tx.storeSettings.update({
        where: { tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      if (!manual && readCodForm(settings.codForm).showLandmark && !input.landmark) {
        throw new BadRequestException({ field: 'landmark', message: 'Enter a nearby landmark so the rider can find you' });
      }
      const number = settings.nextOrderNumber - 1;
      const freeShipping = settings.freeShippingOverPaisa != null && subtotalPaisa >= settings.freeShippingOverPaisa;
      const shippingPaisa = opts.shippingPaisa ?? (freeShipping ? 0 : settings.shippingFeePaisa);
      const discountPaisa = opts.discountPaisa ?? 0;
      if (discountPaisa > subtotalPaisa + shippingPaisa) {
        throw new BadRequestException({ field: 'discountPaisa', message: 'The discount is more than the order total' });
      }

      const customer = await tx.customer.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        create: { tenantId, phone, name: input.name, email: input.email || null, city: input.city },
        update: { name: input.name, city: input.city, ...(input.email ? { email: input.email } : {}) },
      });

      const totalPaisa = subtotalPaisa + shippingPaisa - discountPaisa;
      const decision = opts.alreadyConfirmed ? ({ action: 'none' } as const) : decide(readOrderRules(settings.orderRules), risk, totalPaisa);
      const utm = (value?: string) => (value ? value.slice(0, 150) : null);
      const placedMessage = manual
        ? `Order entered by you${opts.channel ? ` (taken on ${CHANNEL_LABELS[opts.channel] ?? opts.channel})` : ''}`
        : `Order placed with Cash on Delivery (${input.source === 'cart' ? 'cart checkout' : 'COD form'})`;

      let order = await tx.order.create({
        data: {
          tenantId,
          number,
          publicToken: randomToken(16),
          customerId: customer.id,
          source: manual ? 'manual' : input.source,
          customerName: input.name,
          phone,
          email: input.email || null,
          addressLine: input.addressLine,
          landmark: input.landmark || null,
          city: input.city,
          notes: input.notes || null,
          merchantNote: opts.merchantNote ?? null,
          tags: opts.tags ?? [],
          subtotalPaisa,
          shippingPaisa,
          discountPaisa,
          totalPaisa,
          riskLevel: risk.level,
          riskDetail: risk as object,
          onHold: decision.action === 'hold',
          holdReason: decision.action === 'hold' ? decision.reason : null,
          utmSource: utm(input.utm?.source),
          utmMedium: utm(input.utm?.medium),
          utmCampaign: utm(input.utm?.campaign),
          items: {
            create: variants.map((v) => ({
              variantId: v.id,
              title: v.product.title,
              variantTitle: v.title,
              sku: v.sku,
              unitPricePaisa: v.pricePaisa,
              quantity: quantities.get(v.id)!,
            })),
          },
          events: { create: { type: 'placed', actor: manual ? 'merchant' : 'customer', message: placedMessage } },
        },
      });

      if (opts.alreadyConfirmed) {
        order = await this.confirm(tx, order, 'merchant', 'confirmed_in_chat');
        if (risk.level === 'risky') await this.event(tx, order, 'rule', 'system', `Note: high return risk. ${risk.summary}.`);
        return { order, notificationId: null };
      }
      if (decision.action === 'hold') {
        await this.event(tx, order, 'held', 'system', `Held for your review. ${decision.reason}`);
      } else if (decision.action === 'auto_confirm') {
        order = await this.confirm(tx, order, 'system', 'auto_trusted');
        await this.event(tx, order, 'rule', 'system', decision.reason);
        // Already confirmed: no confirmation message needed.
        return { order, notificationId: null };
      }

      // Outbox row written in the same transaction as the order; sent after commit.
      // Manual orders send only when asked, and fail clearly if WhatsApp is not connected.
      const notificationId = manual
        ? opts.sendConfirmation
          ? await this.whatsapp.queueOrderConfirmation(tx, order, { manual: true })
          : null
        : await this.whatsapp.queueOrderConfirmation(tx, order);
      return { order, notificationId };
    });

    if (notificationId) this.whatsapp.dispatch(tenantId, notificationId);
    return order;
  }

  async confirm(tx: Tx, order: Order, actor: Actor, via: string): Promise<Order> {
    if (order.status === 'CONFIRMED') return order;
    if (order.status !== 'PENDING') throw new ConflictException('This order was cancelled and cannot be confirmed');

    // A held order needs the merchant. The customer's confirmation is recorded, not acted on.
    if (order.onHold && actor !== 'merchant') {
      if (order.customerConfirmedAt) return order;
      await this.event(tx, order, 'customer_confirmed', actor, `Customer confirmed (${via.replace(/_/g, ' ')}). Still held for your review.`);
      return tx.order.update({ where: { id: order.id }, data: { customerConfirmedAt: new Date() } });
    }

    if (order.onHold) await this.event(tx, order, 'released', actor, 'Hold released');
    await this.event(tx, order, 'confirmed', actor, `Order confirmed (${via.replace(/_/g, ' ')})`);
    return tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', confirmedVia: via, onHold: false } });
  }

  async cancel(tx: Tx, order: Order, actor: Actor, reason: string): Promise<Order> {
    if (order.status === 'CANCELLED') return order;
    if (order.fulfillmentStatus !== 'UNFULFILLED') {
      throw new ConflictException('This order has already been shipped and cannot be cancelled');
    }
    await this.restock(tx, order);
    await this.event(tx, order, 'cancelled', actor, `Order cancelled (${reason})`);
    return tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
  }

  async ship(tx: Tx, order: Order, courierName: string, trackingNumber: string): Promise<Order> {
    if (order.status !== 'CONFIRMED') throw new ConflictException('Confirm the order with the customer before shipping');
    if (order.fulfillmentStatus !== 'UNFULFILLED') throw new ConflictException('This order has already been shipped');
    await this.event(tx, order, 'shipped', 'merchant', `Shipped with ${courierName}, tracking ${trackingNumber}`);
    return tx.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: 'SHIPPED', courierName, trackingNumber },
    });
  }

  async deliver(tx: Tx, order: Order): Promise<Order> {
    if (order.fulfillmentStatus !== 'SHIPPED') throw new ConflictException('Only shipped orders can be marked delivered');
    await this.event(tx, order, 'delivered', 'merchant', 'Delivered; cash collected by courier');
    return tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: 'DELIVERED', paymentStatus: 'PAID' } });
  }

  async markReturned(tx: Tx, order: Order): Promise<Order> {
    if (order.fulfillmentStatus !== 'SHIPPED') throw new ConflictException('Only shipped orders can be marked returned');
    await this.restock(tx, order);
    await this.event(tx, order, 'returned', 'merchant', 'Parcel returned to origin; stock restored');
    return tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: 'RETURNED' } });
  }

  async findOrThrow(tx: Tx, where: { id: string } | { publicToken: string }): Promise<Order> {
    const order = await tx.order.findFirst({ where });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  event(tx: Tx, order: Order, type: string, actor: Actor, message: string) {
    return tx.orderEvent.create({ data: { tenantId: order.tenantId, orderId: order.id, type, actor, message } });
  }

  private async restock(tx: Tx, order: Order) {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      // updateMany: the variant may have been deleted since the order was placed.
      await tx.productVariant.updateMany({ where: { id: item.variantId, trackInventory: true }, data: { stock: { increment: item.quantity } } });
    }
  }
}
