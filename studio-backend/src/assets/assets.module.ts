import { Module } from '@nestjs/common';
import { AssetUrlService } from './asset-url.service';
import { CloudflareStreamTokenService } from './cloudflare-stream-token.service';

// Presigned-S3-URL support for course assets (3D scans, images, ...) — see
// AssetUrlService for the "why" — plus signed Cloudflare Stream playback
// tokens for course videos (see CloudflareStreamTokenService). ConfigModule
// is registered globally in AppModule, so no explicit import is needed here
// to read AWS_*/CLOUDFLARE_* env vars.
@Module({
  providers: [AssetUrlService, CloudflareStreamTokenService],
  exports: [AssetUrlService, CloudflareStreamTokenService],
})
export class AssetsModule {}
