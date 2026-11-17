import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotificationLog, Order, WhatsappAccount } from '@prisma/client';
import { decrypt } from '../common/crypto';
import { formatRupees } from '../common/util';
import { config, storefrontUrl } from '../config';
import { Db, Tx } from '../db/db.service';

export const CONFIRM_PAYLOAD = 'CONFIRM_ORDER';
export const CANCEL_PAYLOAD = 'CANCEL_ORDER';

interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * WhatsApp order confirmation, two ways:
 *
 *  1. Click-to-chat links (wa.me). Need no credentials: the shopper taps
 *     "Confirm on WhatsApp" after ordering, and the merchant can open a
 *     pre-written confirmation chat from the order page.
 *  2. WhatsApp Business Cloud API, with the merchant's own Meta credentials.
 *     Sends an approved template with Confirm / Cancel buttons automatically
 *     when a COD order is placed; replies arrive on the webhook.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(private readonly db: Db) {}

  // ───────────────────────── click-to-chat links ─────────────────────────

  private async storeContext(tx: Tx, tenantId: string) {
    const [tenant, domain, settings] = await Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      tx.domain.findFirst({ where: { tenantId }, orderBy: { type: 'desc' } }),
      tx.storeSettings.findUniqueOrThrow({ where: { tenantId } }),
    ]);
    return { storeName: tenant.name, baseUrl: domain ? storefrontUrl(domain.hostname) : '', settings };
  }

  /** Links shown to the merchant on the order page. */
  async orderLinks(tx: Tx, order: Order) {
    const { storeName, baseUrl } = await this.storeContext(tx, order.tenantId);
    const confirmationPageUrl = `${baseUrl}/orders/${order.publicToken}`;
    const text = [
      `Assalam o Alaikum ${order.customerName}!`,
      `Thank you for your order #${order.number} from ${storeName}.`,
      '',
      `Total: Rs ${formatRupees(order.totalPaisa)} (Cash on Delivery)`,
      `Deliver to: ${order.addressLine}, ${order.city}`,
      '',
      `Please confirm your order here: ${confirmationPageUrl}`,
      'or reply YES to confirm.',
    ].join('\n');
    return {
      confirmationPageUrl,
      customerChatUrl: `https://wa.me/${order.phone}?text=${encodeURIComponent(text)}`,
    };
  }

  /** Link shown to the shopper after ordering: opens a chat with the store, message pre-filled. */
  async shopperConfirmUrl(tx: Tx, order: Order): Promise<string | null> {
    const { settings } = await this.storeContext(tx, order.tenantId);
    if (!settings.whatsappNumber) return null;
    const text = [
      `Assalam o Alaikum! I want to confirm my order #${order.number}.`,
      `Total: Rs ${formatRupees(order.totalPaisa)} (Cash on Delivery)`,
      `Name: ${order.customerName}`,
      `City: ${order.city}`,
    ].join('\n');
    return `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }

  // ───────────────────────────── Cloud API ───────────────────────────────

  /**
   * Writes the outbox row for an order confirmation. Returns null when the
   * merchant has not connected the Cloud API (or turned automatic sending off).
   */
  async queueOrderConfirmation(tx: Tx, order: Order, opts: { manual?: boolean } = {}): Promise<string | null> {
    const account = await tx.whatsappAccount.findUnique({ where: { tenantId: order.tenantId } });
    if (!account) {
      if (opts.manual) throw new BadRequestException('Connect your WhatsApp Business account in Settings → WhatsApp first');
      return null;
    }
    if (!opts.manual && !account.autoSend) return null;
    const log = await tx.notificationLog.create({
      data: { tenantId: order.tenantId, orderId: order.id, kind: 'order_confirmation', recipient: order.phone },
    });
    return log.id;
  }

  /** Sends after the order transaction has committed, off the request path. */
  dispatch(tenantId: string, notificationId: string): void {
    const job = this.process(tenantId, notificationId)
      .catch((e) => this.logger.error(`WhatsApp send failed for ${notificationId}: ${e}`))
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  /** Resolves once queued sends have finished (used on shutdown and in tests). */
  async idle(): Promise<void> {
    while (this.inFlight.size) await Promise.all([...this.inFlight]);
  }

  async process(tenantId: string, notificationId: string): Promise<NotificationLog> {
    const loaded = await this.db.tenant(tenantId, async (tx) => {
      const log = await tx.notificationLog.findUniqueOrThrow({ where: { id: notificationId }, include: { order: true } });
      const account = await tx.whatsappAccount.findUnique({ where: { tenantId } });
      const { storeName } = await this.storeContext(tx, tenantId);
      return { log, account, storeName };
    });
    const { log, account, storeName } = loaded;
    const order = log.order;
    if (log.status !== 'QUEUED' || !order) return log;

    const result: SendResult = account
      ? await this.sendTemplate(account, log.recipient, [
          order.customerName,
          String(order.number),
          storeName,
          formatRupees(order.totalPaisa),
        ])
      : { ok: false, error: 'WhatsApp account was disconnected' };

    return this.db.tenant(tenantId, async (tx) => {
      await this.recordAccountResult(tx, tenantId, result);
      await tx.orderEvent.create({
        data: {
          tenantId,
          orderId: order.id,
          type: result.ok ? 'whatsapp_sent' : 'whatsapp_failed',
          actor: 'system',
          message: result.ok
            ? 'WhatsApp confirmation request sent to customer'
            : `WhatsApp confirmation could not be sent: ${result.error}`,
        },
      });
      return tx.notificationLog.update({
        where: { id: log.id },
        data: result.ok
          ? { status: 'SENT', providerMessageId: result.messageId }
          : { status: 'FAILED', error: result.error },
      });
    });
  }

  /** Sends the template to the merchant's own number with sample values, to prove the credentials work. */
  async sendTest(tenantId: string, to: string) {
    const { account, storeName } = await this.db.tenant(tenantId, async (tx) => ({
      account: await tx.whatsappAccount.findUnique({ where: { tenantId } }),
      storeName: (await this.storeContext(tx, tenantId)).storeName,
    }));
    if (!account) throw new BadRequestException('Save your WhatsApp credentials first');
    const result = await this.sendTemplate(account, to, ['Test Customer', '1001', storeName, '2,500']);
    await this.db.tenant(tenantId, (tx) => this.recordAccountResult(tx, tenantId, result));
    return result;
  }

  /** An integration is only marked VERIFIED after Meta has accepted a real send. */
  private async recordAccountResult(tx: Tx, tenantId: string, result: SendResult) {
    await tx.whatsappAccount.updateMany({
      where: { tenantId },
      data: result.ok
        ? { status: 'VERIFIED', verifiedAt: new Date(), lastError: null }
        : { lastError: result.error?.slice(0, 500) },
    });
  }

  private async sendTemplate(account: WhatsappAccount, to: string, bodyParams: string[]): Promise<SendResult> {
    const url = `${config.whatsappGraphUrl}/${config.whatsappGraphVersion}/${account.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: account.templateName,
        language: { code: account.templateLanguage },
        components: [
          { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: CONFIRM_PAYLOAD }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: CANCEL_PAYLOAD }] },
        ],
      },
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${decrypt(account.accessTokenEnc)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json: any = await res.json().catch(() => ({}));
      const messageId = json?.messages?.[0]?.id;
      if (res.ok && messageId) return { ok: true, messageId };
      return { ok: false, error: json?.error?.message || `WhatsApp API responded with HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
