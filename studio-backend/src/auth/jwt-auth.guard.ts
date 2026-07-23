import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protects a route with the 'jwt' strategy registered in JwtStrategy —
// requires a valid `Authorization: Bearer <token>` header.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
