import { Controller, Get } from '@nestjs/common';
import { Db } from './db/db.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}

  @Get()
  async health() {
    await this.db.app.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
