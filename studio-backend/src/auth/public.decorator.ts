import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route (or an entire controller) as reachable without a valid
// JWT. JwtAuthGuard is registered as the app-wide default guard (see
// AuthModule's APP_GUARD provider), so every endpoint requires
// `Authorization: Bearer <token>` unless it opts out with this decorator —
// used on the handful of routes a signed-out visitor genuinely needs
// (signup, login, Google sign-in, forgot/reset password, and the app's
// root health-check route).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
