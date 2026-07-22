import { factories } from '@strapi/strapi';
import fs from 'node:fs/promises';
import {
  uploadVideoToCloudflareStream,
  getCloudflareStreamStatus,
  type CloudflareVideoStatus,
} from '../../../utils/cloudflare-stream';

const VIDEO_MIME_PREFIX = 'video/';

type UploadedFile = {
  filepath: string;
  originalFilename?: string;
  newFilename?: string;
  mimetype?: string;
};

type LessonVideoComponent = {
  videoUid?: string;
  durationSeconds?: number;
  status?: CloudflareVideoStatus;
  [key: string]: unknown;
};

function pickUploadedFile(ctx: any): UploadedFile | undefined {
  const files = (ctx.request.files ?? {}) as Record<string, UploadedFile | UploadedFile[]>;
  const candidate = files.file ?? files.video ?? Object.values(files)[0];
  return Array.isArray(candidate) ? candidate[0] : candidate;
}

export default factories.createCoreController('api::lesson.lesson', ({ strapi }) => ({
  /**
   * POST /api/lessons/:id/video
   * multipart/form-data with the video under a `file` (or `video`) field.
   *
   * Uploads the file straight to Cloudflare Stream (server-to-server) and
   * writes the resulting UID/status/duration onto this lesson's `video`
   * (shared.cloudflare-video) component. Strapi's media library / S3
   * provider is intentionally NOT involved — video never becomes a Strapi
   * upload-plugin asset, matching how this project's other media (images,
   * narration audio, .glb scans) goes to S3 while video goes to Stream.
   *
   * `:id` is the lesson's documentId (Strapi 5 Document Service API).
   */
  async uploadVideo(ctx: any) {
    const { id: documentId } = ctx.params;

    const file = pickUploadedFile(ctx);
    if (!file) {
      return ctx.badRequest(
        'No video file provided. Send it as multipart/form-data under the "file" field.'
      );
    }

    if (file.mimetype && !file.mimetype.startsWith(VIDEO_MIME_PREFIX)) {
      await fs.unlink(file.filepath).catch(() => {});
      return ctx.badRequest(`Expected a video file, got "${file.mimetype}".`);
    }

    const existing = await strapi.documents('api::lesson.lesson').findOne({
      documentId,
      populate: ['video'],
    });

    if (!existing) {
      await fs.unlink(file.filepath).catch(() => {});
      return ctx.notFound(`Lesson ${documentId} not found.`);
    }

    let streamResult;
    try {
      streamResult = await uploadVideoToCloudflareStream(
        file.filepath,
        file.originalFilename ?? file.newFilename ?? 'video.mp4'
      );
    } catch (error) {
      strapi.log.error('[lesson.uploadVideo] Cloudflare Stream upload failed', error);
      return ctx.internalServerError(
        error instanceof Error ? error.message : 'Cloudflare Stream upload failed.'
      );
    } finally {
      await fs.unlink(file.filepath).catch(() => {});
    }

    const existingVideo = (existing.video ?? {}) as LessonVideoComponent;

    const updated = await strapi.documents('api::lesson.lesson').update({
      documentId,
      data: {
        video: {
          ...existingVideo,
          videoUid: streamResult.uid,
          status: streamResult.status,
          ...(streamResult.durationSeconds !== undefined
            ? { durationSeconds: streamResult.durationSeconds }
            : {}),
        },
      },
      populate: ['video'],
    });

    ctx.body = { data: updated };
  },

  /**
   * GET /api/lessons/:id/video/status
   *
   * Cloudflare Stream encodes asynchronously, so the status written at
   * upload time is usually still "pending"/"processing". Call this to
   * re-check with Cloudflare and sync the lesson's `video.status` (and
   * duration, once available) — poll it after upload, or wire it to a cron
   * job / admin action later.
   */
  async refreshVideoStatus(ctx: any) {
    const { id: documentId } = ctx.params;

    const existing = await strapi.documents('api::lesson.lesson').findOne({
      documentId,
      populate: ['video'],
    });

    if (!existing) {
      return ctx.notFound(`Lesson ${documentId} not found.`);
    }

    const existingVideo = (existing.video ?? {}) as LessonVideoComponent;
    const videoUid = existingVideo.videoUid;
    if (!videoUid) {
      return ctx.badRequest('This lesson has no video.videoUid to look up yet.');
    }

    let streamResult;
    try {
      streamResult = await getCloudflareStreamStatus(videoUid);
    } catch (error) {
      strapi.log.error('[lesson.refreshVideoStatus] Cloudflare Stream status lookup failed', error);
      return ctx.internalServerError(
        error instanceof Error ? error.message : 'Cloudflare Stream status lookup failed.'
      );
    }

    const updated = await strapi.documents('api::lesson.lesson').update({
      documentId,
      data: {
        video: {
          ...existingVideo,
          videoUid,
          status: streamResult.status,
          ...(streamResult.durationSeconds !== undefined
            ? { durationSeconds: streamResult.durationSeconds }
            : {}),
        },
      },
      populate: ['video'],
    });

    ctx.body = { data: updated };
  },
}));
