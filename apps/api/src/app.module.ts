import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics/analytics.controller';
import { RtoController } from './analytics/rto.controller';
import { ReconciliationController } from './reconciliation/reconciliation.controller';
import { AuthController } from './auth/auth.controller';
import { MerchantGuard } from './auth/auth.guard';
import { ProductsController } from './catalog/products.controller';
import { CollectionsController } from './catalog/collections.controller';
import { CollectionsService } from './catalog/collections.service';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { TlsController } from './tls.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { PlatformController, PlatformGuard } from './platform/platform.controller';
import { RiskService } from './risk/risk.service';
import { SettingsController } from './settings/settings.controller';
import { StoreHostGuard, StorefrontController } from './storefront/storefront.controller';
import { WhatsappController } from './whatsapp/whatsapp.controller';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Module({
  imports: [DbModule],
  controllers: [
    HealthController,
    TlsController,
    AuthController,
    ProductsController,
    CollectionsController,
    OrdersController,
    SettingsController,
    AnalyticsController,
    RtoController,
    ReconciliationController,
    StorefrontController,
    WhatsappController,
    PlatformController,
  ],
  providers: [MerchantGuard, StoreHostGuard, PlatformGuard, OrdersService, WhatsappService, RiskService, CollectionsService],
})
export class AppModule {}
