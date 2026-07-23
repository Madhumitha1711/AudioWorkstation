import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { MailerService } from './mailer.service';

const SALT_ROUNDS = 10;
const RESET_CODE_TTL_MINUTES = 10;

export interface PublicUser {
  id: number;
  email: string;
  username: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      hasPassword: Boolean(user.passwordHash),
      hasGoogle: Boolean(user.googleId),
    };
  }

  private issueToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  async signUp(
    email: string,
    password: string,
    username?: string,
  ): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      // Matches the product requirement literally: a duplicate email is
      // rejected at signup regardless of which method the existing account
      // registered with (password or Google).
      throw new ConflictException('User already in database');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.usersService.create({
      email,
      username: username?.trim() || null,
      passwordHash,
    });

    return { token: this.issueToken(user), user: this.toPublicUser(user) };
  }

  async logIn(email: string, password: string): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { token: this.issueToken(user), user: this.toPublicUser(user) };
  }

  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException(
        'Google Sign-In is not configured on the server (missing GOOGLE_CLIENT_ID)',
      );
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload?.email) {
      throw new UnauthorizedException('Google account has no email address');
    }

    let user = await this.usersService.findByEmail(payload.email);
    if (user) {
      // Existing password/username account signing in with Google for the
      // first time — link the Google identity onto it instead of creating a
      // second row for the same email.
      if (!user.googleId) {
        user.googleId = payload.sub;
        user.isEmailVerified =
          user.isEmailVerified || Boolean(payload.email_verified);
        user = await this.usersService.save(user);
      }
    } else {
      user = await this.usersService.create({
        email: payload.email,
        username: payload.name?.trim() || null,
        googleId: payload.sub,
        isEmailVerified: Boolean(payload.email_verified),
      });
    }

    return { token: this.issueToken(user), user: this.toPublicUser(user) };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    // Always behave the same way whether or not the account exists, so this
    // endpoint can't be used to find out which emails are registered.
    if (!user) return;

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    user.resetCodeHash = await bcrypt.hash(code, SALT_ROUNDS);
    user.resetCodeExpiresAt = new Date(
      Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000,
    );
    await this.usersService.save(user);

    await this.mailer.sendVerificationCode(user.email, code);
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (
      !user ||
      !user.resetCodeHash ||
      !user.resetCodeExpiresAt ||
      user.resetCodeExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const valid = await bcrypt.compare(code, user.resetCodeHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.resetCodeHash = null;
    user.resetCodeExpiresAt = null;
    await this.usersService.save(user);
  }
}
