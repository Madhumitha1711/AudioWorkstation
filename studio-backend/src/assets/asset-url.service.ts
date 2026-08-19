import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Turns a raw studio-cms (Strapi) media URL — a direct S3 object URL — into
 * a short-lived presigned URL, so the S3 bucket storing course assets
 * (3D gear scans, reference images, video thumbnails, ...) never needs a
 * public-read bucket policy. Only this service holds AWS credentials
 * capable of reading the bucket; studio-vr only ever sees the temporary,
 * expiring URL returned from here.
 *
 * Mirrors MailerService's pattern (see ../auth/mailer.service.ts): lazily
 * builds the S3 client only if all required env vars are present, and
 * falls back to passing the original URL through unchanged (with a logged
 * warning) when they're not — so a developer without AWS creds configured
 * yet still gets a working (if public-bucket-dependent) dev experience
 * instead of a hard crash.
 */
@Injectable()
export class AssetUrlService {
  private readonly logger = new Logger(AssetUrlService.name);
  private readonly client: S3Client | null;
  private readonly bucket?: string;
  private readonly expiresInSeconds: number;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('AWS_ASSETS_BUCKET');
    const endpoint = this.config.get<string>('AWS_ASSETS_ENDPOINT');
    const forcePathStyle =
      this.config.get<string>('AWS_ASSETS_FORCE_PATH_STYLE') === 'true';
    this.expiresInSeconds =
      Number(this.config.get<string>('AWS_ASSET_URL_EXPIRES_IN')) || 3600;

    this.client =
      region && accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({
            region,
            credentials: { accessKeyId, secretAccessKey },
            ...(endpoint ? { endpoint, forcePathStyle } : {}),
          })
        : null;

    if (!this.client) {
      this.logger.warn(
        'AWS asset presigning is not configured (need AWS_REGION, ' +
          'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_ASSETS_BUCKET ' +
          'in .env). Falling back to passing studio-cms media URLs through ' +
          'unchanged — this only works if the S3 bucket is public-read.',
      );
    }
  }

  /**
   * Extracts the S3 object key from a raw Strapi/S3 media URL and returns a
   * presigned GET URL for it. Returns the input unchanged (null passes
   * through as null) if presigning isn't configured, the URL doesn't look
   * like an S3 object in the configured bucket, or signing fails for any
   * reason — a broken asset URL shouldn't take down the whole course
   * response, it should just fall back to whatever URL Strapi gave us.
   */
  async presign(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;
    if (!this.client || !this.bucket) return url;

    const key = this.extractKey(url);
    if (!key) return url;

    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.client, command, {
        expiresIn: this.expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(
        `Failed to presign asset URL for key "${key}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return url;
    }
  }

  /**
   * Pulls the object key back out of an S3 URL in any of the shapes the
   * @strapi/provider-upload-aws-s3 provider can produce:
   *   - virtual-hosted-style: https://<bucket>.s3.<region>.amazonaws.com/<key>
   *   - path-style:           https://s3.<region>.amazonaws.com/<bucket>/<key>
   *   - an S3-compatible/custom endpoint (R2, MinIO, ...) in either style.
   * Returns null for anything that isn't recognizably an S3 object URL for
   * the configured bucket (e.g. a relative Strapi-local-upload path in
   * dev) — the caller falls back to the original URL in that case.
   */
  private extractKey(url: string): string | null {
    if (!this.bucket) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const bucket = this.bucket;
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');

    if (parsed.hostname.startsWith(`${bucket}.`)) {
      // virtual-hosted-style — bucket is in the hostname, the rest of the
      // path is the key.
      return path || null;
    }
    if (path.startsWith(`${bucket}/`)) {
      // path-style — bucket is the first path segment.
      return path.slice(bucket.length + 1) || null;
    }
    return null;
  }
}
