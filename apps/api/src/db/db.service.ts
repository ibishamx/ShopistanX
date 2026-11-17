import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { config } from '../config';

export type Tx = Prisma.TransactionClient;

/**
 * Two connections, two database roles.
 *
 *  - `app` cannot bypass row-level security. Tenant tables are only readable
 *    inside `tenant()`, which opens a transaction and sets app.tenant_id
 *    before any query. A tenant-table query outside `tenant()` errors.
 *  - `platform` bypasses row-level security and is used only by Super Admin
 *    routes, which write every action to the audit log.
 */
@Injectable()
export class Db implements OnModuleDestroy {
  readonly app = new PrismaClient({ datasourceUrl: config.appDatabaseUrl });
  readonly platform = new PrismaClient({ datasourceUrl: config.platformDatabaseUrl });

  tenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.app.$disconnect(), this.platform.$disconnect()]);
  }
}
