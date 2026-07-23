import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SKIP_PAYMENT_KEY } from './skip-payment.decorator';
import { User } from '../users/user.entity';

// Registered as the app-wide default guard in AuthModule (via APP_GUARD),
// so it runs in front of every route in the app. Requires a valid
// `Authorization: Bearer <token>` (checked against the 'jwt' strategy in
// JwtStrategy) unless the route/controller is marked with @Public() —
// and, on top of authentication, also requires the signed-in user to have
// access (request.user.hasAccess — a real payment OR an admin account,
// see User.hasAccess) unless the route is marked @SkipPayment().
//
// Both checks live in this one guard, in this one method, deliberately:
// spreading "must be signed in" and "must have paid" across two separate
// APP_GUARD providers would make correctness depend on Nest's cross-module
// guard ordering, which isn't something worth betting a "payment can't be
// bypassed" requirement on. One guard, one order, no ambiguity.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Runs the 'jwt' passport strategy — throws UnauthorizedException on a
    // missing/invalid/expired token, otherwise populates request.user (see
    // JwtStrategy.validate) before the payment check below runs.
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const skipPayment = this.reflector.getAllAndOverride<boolean>(
      SKIP_PAYMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipPayment) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    // This is the single enforcement point for "no API access without
    // payment" — every controller in the app is covered by default since
    // JwtAuthGuard is the app-wide guard, and only @Public()/@SkipPayment()
    // routes opt out explicitly and visibly at the handler. hasAccess is
    // true for a real purchase *or* an admin account (see User.hasAccess),
    // so admins skip payment without needing a separate check here.
    if (!user?.hasAccess) {
      throw new ForbiddenException({
        message: 'Payment required to access this resource.',
        code: 'PAYMENT_REQUIRED',
      });
    }

    return true;
  }
}
