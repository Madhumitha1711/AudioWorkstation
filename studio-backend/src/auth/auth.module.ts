import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { MailerService } from './mailer.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>(
          'JWT_SECRET',
          'dev-only-insecure-secret-change-me',
        ),
        signOptions: {
          // JwtSignOptions['expiresIn'] is typed as `number | StringValue`
          // (a branded template-literal type from the `ms` package), not a
          // plain `string` — so a value read out of ConfigService (which is
          // just `string`) needs an explicit cast here even though '7d' is
          // exactly the kind of value `ms` accepts at runtime. Keeping
          // JWT_EXPIRES_IN as a human-friendly duration string ('7d', '1h')
          // in .env rather than switching to raw seconds.
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '7d',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    MailerService,
    // Makes JwtAuthGuard the default guard for every route in the app, not
    // just ones explicitly decorated with @UseGuards — see JwtAuthGuard
    // and the @Public() decorator for how individual routes (signup,
    // login, the app root, etc.) opt back out of this.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
