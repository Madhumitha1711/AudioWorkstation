import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // These five routes are the only ones a signed-out visitor can reach at
  // all — everything else in the app requires a valid token by default
  // (see JwtAuthGuard, registered app-wide in AuthModule).
  @Public()
  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto.email, dto.password, dto.username);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  logIn(@Body() dto: LoginDto) {
    return this.authService.logIn(dto.email, dto.password);
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto.idToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Deliberately generic — see AuthService.forgotPassword for why this
    // doesn't reveal whether the email is actually registered.
    return {
      message: 'If that email is registered, a verification code has been sent.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { message: 'Password updated.' };
  }

  // Not marked @Public() — requires a valid token like every other route
  // now that JwtAuthGuard is applied app-wide.
  @Get('me')
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      hasPassword: Boolean(user.passwordHash),
      hasGoogle: Boolean(user.googleId),
    };
  }
}
