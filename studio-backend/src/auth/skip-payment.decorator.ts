import { SetMetadata } from '@nestjs/common';

export const SKIP_PAYMENT_KEY = 'skipPayment';

// Marks an authenticated route as reachable even though the signed-in user
// hasn't completed payment yet. Used only on:
//   - GET /auth/me (so the frontend can find out *whether* payment is
//     needed in the first place, right after signup/login)
//   - the payment/checkout endpoints themselves (create-order, verify,
//     status) — the whole point of those is to be callable before hasPaid
//     becomes true
//
// Every other authenticated route is enforced by JwtAuthGuard, which
// rejects with 403 if request.user.hasPaid is false and this decorator
// isn't present. That single check is what makes payment impossible to
// bypass — there is no route that skips it by accident.
export const SkipPayment = () => SetMetadata(SKIP_PAYMENT_KEY, true);
