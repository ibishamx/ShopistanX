import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { normalizePkMobile } from '../common/phone';
import { parse } from '../common/util';
import { Db } from '../db/db.service';
import { orderRulesSchema, readOrderRules } from '../risk/risk.service';
import { codFormSchema, readCodForm, readTheme, themeSchema } from './defaults';

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  supportPhone: z.string().trim().max(20).nullish(),
  whatsappNumber: z.string().trim().max(20).nullish(),
  shippingFeePaisa: z.number().int().min(0).max(10_000_000),
  freeShippingOverPaisa: z.number().int().min(0).max(1_000_000_000).nullish(),
  codForm: codFormSchema,
  theme: themeSchema,
  orderRules: orderRulesSchema,
});

@Controller('admin/settings')
@UseGuards(MerchantGuard)
export class SettingsController {
  constructor(private readonly db: Db) {}

  @Get()
  async get(@Auth() auth: MerchantAuth) {
    const tenantId = auth.tenantId;
    const [tenant, settings] = await Promise.all([
      this.db.app.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.db.tenant(tenantId, (tx) => tx.storeSettings.findUniqueOrThrow({ where: { tenantId } })),
    ]);
    return {
      storeName: tenant.name,
      supportPhone: settings.supportPhone,
      whatsappNumber: settings.whatsappNumber,
      shippingFeePaisa: settings.shippingFeePaisa,
      freeShippingOverPaisa: settings.freeShippingOverPaisa,
      codForm: readCodForm(settings.codForm),
      theme: readTheme(settings.theme),
      orderRules: readOrderRules(settings.orderRules),
    };
  }

  @Put()
  async update(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(settingsSchema, body);
    const tenantId = auth.tenantId;
    const mobile = (field: string, value?: string | null) => {
      if (!value) return null;
      const normalized = normalizePkMobile(value);
      if (!normalized) throw new BadRequestException({ field, message: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567' });
      return normalized;
    };
    const whatsappNumber = mobile('whatsappNumber', input.whatsappNumber);

    await this.db.tenant(tenantId, async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { name: input.storeName } });
      await tx.storeSettings.update({
        where: { tenantId },
        data: {
          supportPhone: input.supportPhone || null,
          whatsappNumber,
          shippingFeePaisa: input.shippingFeePaisa,
          freeShippingOverPaisa: input.freeShippingOverPaisa ?? null,
          codForm: input.codForm,
          theme: input.theme,
          orderRules: input.orderRules,
        },
      });
    });
    return this.get(auth);
  }
}
