import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'jsonwebtoken';
import { createPrivateKey } from 'node:crypto';

/**
 * Mints short-lived Cloudflare Stream signed playback tokens, so a leaked
 * videoUid (visible in any /courses network response, view-source, a
 * shared link, ...) can't be used to watch a paid course's video directly
 * via https://iframe.cloudflarestream.com/<uid> — that URL shape plays back
 * ANY video whose Stream-side "Require signed URLs" flag isn't set,
 * regardless of who's asking. studio-cms now uploads every new video with
 * that flag on (see studio-cms's uploadVideoToCloudflareStream), which
 * means the bare UID stops working for playback entirely; the only way to
 * play it is a short-lived RS256 JWT minted with a Cloudflare Stream
 * signing key (Cloudflare dashboard/API: Stream -> "Signing Keys"). Only
 * this service — reachable exclusively through CoursesService, behind
 * /courses' JwtAuthGuard + paid-access check — holds that signing key, so
 * only a signed-in, paid student can ever get a working playback token.
 *
 * Mirrors AssetUrlService's fallback pattern: falls back to passing the
 * raw videoUid through unchanged (with a logged warning) if signing isn't
 * configured, so local dev without a Stream signing key still works as
 * long as the video wasn't uploaded with requireSignedURLs. In production
 * this MUST be configured — otherwise course.mapper.ts is silently handing
 * back plain UIDs and the "paid" video content is playable by anyone who
 * captures one.
 */
@Injectable()
export class CloudflareStreamTokenService {
  private readonly logger = new Logger(CloudflareStreamTokenService.name);
  private readonly keyId?: string;
  private readonly signingKey?: string;
  private readonly expiresInSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.keyId = this.config.get<string>('CLOUDFLARE_STREAM_KEY_ID') || undefined;
    // The PEM is stored in .env with literal "\n" escapes (so it survives
    // as a single-line env var) — restore real newlines before signing.
    const rawKey = this.config.get<string>('CLOUDFLARE_STREAM_SIGNING_KEY');
    this.signingKey = rawKey ? rawKey.replace(/\\n/g, '\n') : undefined;
    this.expiresInSeconds =
      Number(this.config.get<string>('CLOUDFLARE_STREAM_TOKEN_EXPIRES_IN')) ||
      14400; // 4h: generous enough that a student mid-lesson doesn't hit a
      // dead iframe if /courses isn't refetched, short enough to cap how
      // long a captured token (e.g. shared out-of-band) stays useful.

    if (!this.keyId || !this.signingKey) {
      this.logger.warn(
        'Cloudflare Stream signing is not configured (need ' +
          'CLOUDFLARE_STREAM_KEY_ID and CLOUDFLARE_STREAM_SIGNING_KEY in ' +
          '.env — see .env.example). Falling back to passing raw videoUids ' +
          'through unchanged, which only plays back for videos NOT uploaded ' +
          'with requireSignedURLs. Do not run production like this.',
      );
    } else {
      // Fail loudly and ONCE at startup rather than on every /courses
      // request: the most common misconfiguration is pasting Cloudflare's
      // `result.pem` in verbatim, which is base64-encoded and does NOT
      // parse as a private key on its own (see .env.example) — that used
      // to surface as a per-video jsonwebtoken "secretOrPrivateKey must be
      // an asymmetric key" stack trace instead of a clear message here.
      try {
        createPrivateKey(this.signingKey);
      } catch (error) {
        this.logger.error(
          'CLOUDFLARE_STREAM_SIGNING_KEY is set but is not a valid private ' +
            "key — did you paste Cloudflare's `result.pem` in as-is? That " +
            'field is base64-encoded; it needs to be decoded to real PEM ' +
            'text first (see .env.example, or just run ' +
            '`npm run create:stream-key` from studio-cms/, which handles ' +
            'this). Falling back to passing raw videoUids through ' +
            'unchanged until this is fixed.',
          error instanceof Error ? error.message : String(error),
        );
        this.keyId = undefined;
        this.signingKey = undefined;
      }
    }
  }

  /**
   * Returns a short-lived signed Stream playback token for the given video
   * UID, or the raw UID unchanged (null passes through as null) if signing
   * isn't configured or signing fails for any reason — a broken/misissued
   * token shouldn't take down the whole course response, it should just
   * fall back to whatever the CMS gave us (playable only for
   * not-yet-secured videos). studio-vr embeds whatever comes back here in
   * place of the raw UID: https://iframe.cloudflarestream.com/<result>.
   */
  sign(videoUid: string | null | undefined): string | null {
    if (!videoUid) return null;
    if (!this.keyId || !this.signingKey) return videoUid;

    try {
      // Token shape per Cloudflare's Stream signed URL token spec: an
      // RS256 JWT whose header AND payload both carry the signing key's
      // `kid`, with `sub` set to the video UID being authorized.
      return sign({ sub: videoUid, kid: this.keyId }, this.signingKey, {
        algorithm: 'RS256',
        header: { alg: 'RS256', kid: this.keyId },
        expiresIn: this.expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(
        `Failed to sign Stream playback token for video "${videoUid}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return videoUid;
    }
  }
}
