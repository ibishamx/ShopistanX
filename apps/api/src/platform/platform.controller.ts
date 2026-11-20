import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { randomToken, sha256, verifyPassword } from '../common/crypto';
import { parse } from '../common/util';
import { config, primaryHostname, storefrontUrl } from '../config';
import { Db } from '../db/db.service';

// Super Admin: separate staff table, separate session cookie, separate database role.
export const ADMIN_COOKIE = 'sx_admin';

interface Staff {
  id: string;
  email: string;
  ip: string;
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { staff?: Staff }>();
    const token = req.cookies?.[ADMIN_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');
    const session = await this.db.platform.platformSession.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException('Session expired');
    req.staff = { id: session.adminId, email: session.admin.email, ip: req.ip ?? '' };
    return true;
  }
}

const CurrentStaff = createParamDecorator((_: unknown, context: ExecutionContext): Staff => context.switchToHttp().getRequest().staff);

@Controller('platform')
export class PlatformController {
  constructor(private readonly db: Db) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), body);
    const admin = await this.db.platform.platformAdmin.findUnique({ where: { email: input.email } });
    if (!admin || !verifyPassword(input.password, admin.passwordHash)) throw new UnauthorizedException('Incorrect email or password');
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 12 * 3_600_000);
    await this.db.platform.platformSession.create({ data: { tokenHash: sha256(token), adminId: admin.id, expiresAt } });
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/', expires: expiresAt });
    return { ok: true };
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (token) await this.db.platform.platformSession.deleteMany({ where: { tokenHash: sha256(token) } });
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(PlatformGuard)
  me(@CurrentStaff() staff: Staff) {
    return { email: staff.email };
  }

  @Get('tenants')
  @UseGuards(PlatformGuard)
  async tenants(@CurrentStaff() staff: Staff) {
    const p = this.db.platform;
    const [tenants, orders, products] = await Promise.all([
      p.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: { domains: true, memberships: { where: { role: 'owner' }, include: { user: { select: { email: true, name: true } } } } },
      }),
      p.order.groupBy({ by: ['tenantId'], _count: true }),
      p.product.groupBy({ by: ['tenantId'], _count: true }),
    ]);
    await this.audit(staff, 'tenants.list', null, { count: tenants.length });
    const count = (rows: { tenantId: string; _count: number }[], id: string) => rows.find((r) => r.tenantId === id)?._count ?? 0;
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      createdAt: t.createdAt,
      url: primaryHostname(t.domains) ? storefrontUrl(primaryHostname(t.domains)!) : null,
      owner: t.memberships[0]?.user ?? null,
      orders: count(orders, t.id),
      products: count(products, t.id),
    }));
  }

  @Post('tenants/:id/suspend')
  @HttpCode(200)
  @UseGuards(PlatformGuard)
  suspend(@CurrentStaff() staff: Staff, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for the audit log').max(300) }), body);
    return this.setStatus(staff, id, 'SUSPENDED', 'tenant.suspend', reason);
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(200)
  @UseGuards(PlatformGuard)
  reactivate(@CurrentStaff() staff: Staff, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(staff, id, 'ACTIVE', 'tenant.reactivate');
  }

  @Get('audit-logs')
  @UseGuards(PlatformGuard)
  auditLogs() {
    return this.db.platform.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  private async setStatus(staff: Staff, id: string, status: TenantStatus, action: string, reason?: string) {
    return this.db.platform.$transaction(async (tx) => {
      const before = await tx.tenant.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Store not found');
      const after = await tx.tenant.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorId: staff.id,
          actorEmail: staff.email,
          targetTenantId: id,
          action,
          ip: staff.ip,
          detail: { store: before.slug, before: before.status, after: after.status, ...(reason ? { reason } : {}) },
        },
      });
      return { id: after.id, status: after.status };
    });
  }

  private audit(staff: Staff, action: string, targetTenantId: string | null, detail: object) {
    return this.db.platform.auditLog.create({
      data: { actorId: staff.id, actorEmail: staff.email, targetTenantId, action, ip: staff.ip, detail },
    });
  }
}
