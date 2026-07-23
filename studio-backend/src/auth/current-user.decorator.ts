import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../users/user.entity';

// Pulls the User entity that JwtStrategy.validate() attached to the request
// (only meaningful behind JwtAuthGuard) — use as @CurrentUser() user: User
// in a controller method instead of reaching into the raw request.
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
