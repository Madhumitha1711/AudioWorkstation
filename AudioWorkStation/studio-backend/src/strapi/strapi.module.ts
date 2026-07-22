import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StrapiService } from './strapi.service';

// Thin, reusable HTTP client for studio-cms (Strapi). Any feature module
// that needs to read CMS content imports this module and injects
// StrapiService rather than talking to axios directly.
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('STRAPI_BASE_URL', 'http://localhost:1337'),
        timeout: 10_000,
        headers: {
          Authorization: `Bearer ${config.get<string>('STRAPI_API_TOKEN', '')}`,
        },
      }),
    }),
  ],
  providers: [StrapiService],
  exports: [StrapiService],
})
export class StrapiModule {}
