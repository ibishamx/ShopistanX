import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { sha256 } from '../common/crypto';
import { Db } from '../db/db.service';

export const SESSION_COOKIE = 'sx_session';

export interface MerchantAuth {
  sessionId: string;
  userId: string;
  tenantId: string;
}

/**
 * Merchant Admin requests. The tenant comes from the server-side session,
 * never from anything the client sends.
 */
@Injectable()
export class MerchantGuard implements CanActivate {
  constructor(private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { auth?: MerchantAuth }>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');

    const session = await this.db.app.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { tenant: true },
    });
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    // The membership is re-checked on every request so removing a user takes effect at once.
    const membership = await this.db.app.membership.findUnique({
      where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId } },
    });
    if (!membership) throw new UnauthorizedException('No access to this store');

    if (session.tenant.status === 'SUSPENDED' || session.tenant.status === 'DEACTIVATED') {
      throw new ForbiddenException({
        code: 'STORE_SUSPENDED',
        message: 'This store has been suspended. Please contact Shopistan support.',
      });
    }

    req.auth = { sessionId: session.id, userId: session.userId, tenantId: session.tenantId };
    return true;
  }
}

export const Auth = createParamDecorator((_: unknown, context: ExecutionContext): MerchantAuth => {
  return context.switchToHttp().getRequest().auth;
});
