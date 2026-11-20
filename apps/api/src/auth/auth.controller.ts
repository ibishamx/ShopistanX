import { Body, ConflictException, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { hashPassword, randomToken, sha256, verifyPassword } from '../common/crypto';
import { parse, slugify } from '../common/util';
import { config, primaryHostname, storefrontHostname, storefrontUrl } from '../config';
import { Db } from '../db/db.service';
import { DEFAULT_COD_FORM, DEFAULT_THEME } from '../settings/defaults';
import { Auth, MerchantAuth, MerchantGuard, SESSION_COOKIE } from './auth.guard';

const SESSION_DAYS = 30;
const RESERVED_SLUGS = new Set(['www', 'app', 'admin', 'api', 'store', 'shop', 'mail', 'support', 'help', 'shopistan']);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  storeName: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().max(40).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly db: Db) {}

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(registerSchema, body);
    const slug = slugify(input.slug || input.storeName);
    if (slug.length < 3) throw new ConflictException({ field: 'slug', message: 'Store address must be at least 3 characters' });
    if (RESERVED_SLUGS.has(slug)) throw new ConflictException({ field: 'slug', message: 'That store address is reserved' });

    if (await this.db.app.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException({ field: 'email', message: 'An account with this email already exists. Sign in instead.' });
    }
    if (await this.db.app.tenant.findUnique({ where: { slug } })) {
      throw new ConflictException({ field: 'slug', message: 'That store address is taken. Try another.' });
    }

    const { user, tenant } = await this.db.app.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: input.storeName, slug } });
      await tx.domain.create({ data: { hostname: storefrontHostname(slug), tenantId: tenant.id } });
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash: hashPassword(input.password) },
      });
      await tx.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'owner' } });
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      await tx.storeSettings.create({
        data: { tenantId: tenant.id, codForm: DEFAULT_COD_FORM, theme: DEFAULT_THEME },
      });
      return { user, tenant };
    });

    await this.startSession(res, user.id, tenant.id);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(loginSchema, body);
    const user = await this.db.app.user.findUnique({
      where: { email: input.email },
      include: { memberships: { orderBy: { id: 'asc' }, take: 1 } },
    });
    if (!user || !verifyPassword(input.password, user.passwordHash) || !user.memberships[0]) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    await this.startSession(res, user.id, user.memberships[0].tenantId);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await this.db.app.session.deleteMany({ where: { tokenHash: sha256(token) } });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(MerchantGuard)
  async me(@Auth() auth: MerchantAuth) {
    const [user, tenant, domains] = await Promise.all([
      this.db.app.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      this.db.app.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } }),
      this.db.app.domain.findMany({ where: { tenantId: auth.tenantId } }),
    ]);
    return {
      user: { id: user.id, name: user.name, email: user.email },
      store: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        url: primaryHostname(domains) ? storefrontUrl(primaryHostname(domains)!) : null,
      },
    };
  }

  private async startSession(res: Response, userId: string, tenantId: string) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await this.db.app.session.create({ data: { tokenHash: sha256(token), userId, tenantId, expiresAt } });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      expires: expiresAt,
    });
  }
}
