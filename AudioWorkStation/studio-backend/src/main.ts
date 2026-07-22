import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  await app.listen(config.get<number>('PORT', 3000));
}
void bootstrap();
