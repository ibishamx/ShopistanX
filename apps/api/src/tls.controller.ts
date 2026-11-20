import { Controller, Get, HttpCode, NotFoundException, Query } from '@nestjs/common';
import { Db } from './db/db.service';

/**
 * Asked by the reverse proxy (Caddy on-demand TLS) before it requests a
 * certificate for a storefront hostname. Only hostnames in the domains table
 * get one, so nobody can make the server request certificates for arbitrary
 * names. Not exposed publicly: the proxy only forwards /webhooks/* to the API.
 */
@Controller('internal/tls')
export class TlsController {
  constructor(private readonly db: Db) {}

  @Get('allowed')
  @HttpCode(200)
  async allowed(@Query('domain') domain?: string) {
    const hostname = String(domain ?? '').trim().toLowerCase();
    if (!hostname) throw new NotFoundException();
    const found = await this.db.app.domain.findUnique({ where: { hostname }, include: { tenant: { select: { status: true } } } });
    if (!found || !found.verified || found.tenant.status === 'DEACTIVATED') throw new NotFoundException();
    return { ok: true };
  }
}
