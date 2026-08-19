import { Module } from '@nestjs/common';
import { AssetUrlService } from './asset-url.service';

// Presigned-S3-URL support for course assets (3D scans, images, ...) — see
// AssetUrlService for the "why". ConfigModule is registered globally in
// AppModule, so no explicit import is needed here to read AWS_* env vars.
@Module({
  providers: [AssetUrlService],
  exports: [AssetUrlService],
})
export class AssetsModule {}
