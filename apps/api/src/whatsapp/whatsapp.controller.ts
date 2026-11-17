import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Logger, NotFoundException, Param, Post, Put, Query, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { decrypt, encrypt, hmacSha256Hex, randomToken, safeEqual } from '../common/crypto';
import { normalizePkMobile } from '../common/phone';
import { UUID_RE, parse } from '../common/util';
import { config } from '../config';
import { Db } from '../db/db.service';
import { OrdersService } from '../orders/orders.service';
import { CANCEL_PAYLOAD, CONFIRM_PAYLOAD, WhatsappService } from './whatsapp.service';

const saveSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, 'The Phone number ID is the numeric ID from Meta, not the phone number'),
  accessToken: z.string().trim().min(20).max(1000).optional(),
  appSecret: z.string().trim().min(8).max(200).optional(),
  templateName: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'Template names use lowercase letters, numbers and underscores'),
  templateLanguage: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'Use a language code like en, en_US or ur'),
  autoSend: z.boolean(),
});

const YES = /^\s*(yes|y|confirm|confirmed|ok|okay|han|haan|ji|jee|g|جی|ہاں)\b/i;
const NO = /^\s*(no|n|cancel|nahi|nahin|نہیں)\b/i;

@Controller()
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly db: Db,
    private readonly whatsapp: WhatsappService,
    private readonly orders: OrdersService,
  ) {}

  // ───────────────────────── Merchant settings ─────────────────────────

  @Get('admin/whatsapp')
  @UseGuards(MerchantGuard)
  async get(@Auth() auth: MerchantAuth) {
    const account = await this.db.tenant(auth.tenantId, (tx) => tx.whatsappAccount.findUnique({ where: { tenantId: auth.tenantId } }));
    const webhookUrl = `${config.apiUrl}/webhooks/whatsapp/${auth.tenantId}`;
    if (!account) return { status: 'NOT_CONFIGURED', webhookUrl };
    return {
      status: account.status,
      phoneNumberId: account.phoneNumberId,
      templateName: account.templateName,
      templateLanguage: account.templateLanguage,
      autoSend: account.autoSend,
      hasAppSecret: !!account.appSecretEnc,
      verifyToken: account.verifyToken,
      lastError: account.lastError,
      verifiedAt: account.verifiedAt,
      webhookUrl,
    };
  }

  @Put('admin/whatsapp')
  @UseGuards(MerchantGuard)
  async save(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(saveSchema, body);
    const tenantId = auth.tenantId;
    await this.db.tenant(tenantId, async (tx) => {
      const existing = await tx.whatsappAccount.findUnique({ where: { tenantId } });
      if (!existing && !input.accessToken) throw new BadRequestException({ field: 'accessToken', message: 'Enter the access token' });
      const credentialsChanged =
        !existing || !!input.accessToken || existing.phoneNumberId !== input.phoneNumberId || existing.templateName !== input.templateName;
      const data = {
        phoneNumberId: input.phoneNumberId,
        templateName: input.templateName,
        templateLanguage: input.templateLanguage,
        autoSend: input.autoSend,
        ...(input.accessToken ? { accessTokenEnc: encrypt(input.accessToken) } : {}),
        ...(input.appSecret ? { appSecretEnc: encrypt(input.appSecret) } : {}),
        // Changed credentials have not been proven to work yet.
        ...(credentialsChanged ? { status: 'UNVERIFIED' as const, verifiedAt: null, lastError: null } : {}),
      };
      if (existing) await tx.whatsappAccount.update({ where: { tenantId }, data });
      else await tx.whatsappAccount.create({ data: { ...data, tenantId, accessTokenEnc: encrypt(input.accessToken!), verifyToken: randomToken(16) } });
    });
    return this.get(auth);
  }

  @Delete('admin/whatsapp')
  @UseGuards(MerchantGuard)
  async disconnect(@Auth() auth: MerchantAuth) {
    await this.db.tenant(auth.tenantId, (tx) => tx.whatsappAccount.deleteMany({}));
    return { ok: true };
  }

  @Post('admin/whatsapp/test')
  @HttpCode(200)
  @UseGuards(MerchantGuard)
  async test(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const { to } = parse(z.object({ to: z.string() }), body);
    const phone = normalizePkMobile(to);
    if (!phone) throw new BadRequestException({ field: 'to', message: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567' });
    return this.whatsapp.sendTest(auth.tenantId, phone);
  }

  // ───────────────────────────── Webhook ───────────────────────────────
  // Each merchant registers their own URL in their Meta app. The tenant id in
  // the path only selects whose secret to check; the signature authenticates.

  @Get('webhooks/whatsapp/:tenantId')
  async verify(
    @Param('tenantId') tenantId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const account = await this.loadAccount(tenantId);
    if (mode !== 'subscribe' || !token || !safeEqual(token, account.verifyToken)) throw new ForbiddenException();
    return challenge;
  }

  @Post('webhooks/whatsapp/:tenantId')
  @HttpCode(200)
  async receive(@Param('tenantId') tenantId: string, @Req() req: RawBodyRequest<Request>) {
    const account = await this.loadAccount(tenantId);
    if (!account.appSecretEnc) throw new ForbiddenException('App secret not configured');
    const signature = String(req.headers['x-hub-signature-256'] ?? '');
    const expected = `sha256=${hmacSha256Hex(decrypt(account.appSecretEnc), req.rawBody ?? Buffer.alloc(0))}`;
    if (!safeEqual(signature, expected)) throw new ForbiddenException('Bad signature');

    const body: any = req.body;
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        // Ignore events for a different number than the one this merchant connected.
        if (value?.metadata?.phone_number_id !== account.phoneNumberId) continue;
        for (const status of value?.statuses ?? []) await this.onStatus(tenantId, status);
        for (const message of value?.messages ?? []) {
          await this.onMessage(tenantId, message).catch((e) => this.logger.warn(`Webhook message ignored: ${e.message}`));
        }
      }
    }
    return { ok: true };
  }

  private async loadAccount(tenantId: string) {
    if (!UUID_RE.test(tenantId)) throw new NotFoundException();
    const account = await this.db.tenant(tenantId, (tx) => tx.whatsappAccount.findUnique({ where: { tenantId } }));
    if (!account) throw new NotFoundException();
    return account;
  }

  private async onStatus(tenantId: string, status: any) {
    const map: Record<string, 'DELIVERED' | 'READ' | 'FAILED'> = { delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
    const next = map[status?.status];
    if (!next || typeof status?.id !== 'string') return;
    await this.db.tenant(tenantId, (tx) =>
      tx.notificationLog.updateMany({
        where: { providerMessageId: status.id, ...(next === 'DELIVERED' ? { status: 'SENT' } : {}) },
        data: { status: next, ...(next === 'FAILED' ? { error: status?.errors?.[0]?.title ?? 'Delivery failed' } : {}) },
      }),
    );
  }

  private async onMessage(tenantId: string, message: any) {
    let decision: 'confirm' | 'cancel' | null = null;
    if (message?.type === 'button') {
      const payload = message.button?.payload;
      decision = payload === CONFIRM_PAYLOAD ? 'confirm' : payload === CANCEL_PAYLOAD ? 'cancel' : null;
    } else if (message?.type === 'text') {
      const text = String(message.text?.body ?? '');
      decision = YES.test(text) ? 'confirm' : NO.test(text) ? 'cancel' : null;
    }
    if (!decision) return;

    await this.db.tenant(tenantId, async (tx) => {
      // Prefer the message being replied to; fall back to the sender's latest pending order.
      const repliedTo = message?.context?.id;
      const log = await tx.notificationLog.findFirst({
        where: {
          kind: 'order_confirmation',
          orderId: { not: null },
          ...(repliedTo
            ? { providerMessageId: repliedTo }
            : { recipient: String(message?.from ?? ''), status: { in: ['SENT', 'DELIVERED', 'READ'] }, order: { status: 'PENDING' } }),
        },
        orderBy: { createdAt: 'desc' },
        include: { order: true },
      });
      // The reply must come from the number the confirmation was sent to.
      if (!log?.order || log.recipient !== message.from) return;
      if (decision === 'confirm') await this.orders.confirm(tx, log.order, 'whatsapp', 'whatsapp_reply');
      else await this.orders.cancel(tx, log.order, 'whatsapp', 'customer replied on WhatsApp');
    });
  }
}
