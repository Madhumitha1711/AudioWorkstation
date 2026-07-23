import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true keeps the exact request bytes available on req.rawBody
  // alongside the normal JSON-parsed body — needed by PaymentsController's
  // webhook routes, whose signature verification (RazorpayGateway /
  // StripeGateway .verifyWebhook) is computed over the raw payload the
  // gateway sent, not a re-serialized copy of it.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // studio-vr (the Vite dev server / eventual static host) calls this API
  // directly, so it needs to be allowed cross-origin. Auth will tighten
  // this further later; for now any origin not explicitly listed in
  // CORS_ORIGINS is blocked once that env var is set.
  const corsOrigins = config.get<string>('CORS_ORIGINS');
  app.enableCors({
    origin: corsOrigins
      ? corsOrigins.split(',').map((origin) => origin.trim())
      : true,
  });

  // Strips unknown properties and rejects invalid ones (bad email format,
  // password too short, etc.) for every DTO across the app — this is what
  // turns the class-validator decorators on the auth DTOs into actual 400
  // responses instead of silently passing bad input through.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(config.get<number>('PORT', 3000));
}
void bootstrap();
