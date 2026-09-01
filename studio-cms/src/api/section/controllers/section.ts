import { factories } from '@strapi/strapi';
import fs from 'node:fs/promises';
import {
  uploadVideoToCloudflareStream,
  getCloudflareStreamStatus,
  type CloudflareVideoStatus,
} from '../../../utils/cloudflare-stream';

const VIDEO_MIME_PREFIX = 'video/';
const VIDEO_BLOCK_COMPONENT = 'course.video-block';
// Every OTHER component type that can appear in Section.blocks (course/section/schema.json's
// `blocks` dynamic zone). Strapi's dynamic-zone populate resolver (@strapi/database's morphToMany
// populate helper) treats the `on` map as an allowlist: any block whose `__component` is NOT a key
// of `on` is silently dropped from the returned array entirely (not just left unpopulated) — see
// findVideoBlock below. Add a new block type to the dynamic zone? Add its UID here too, or index
// lookups here will drift out of sync with the true blocks[] position again.
const OTHER_BLOCK_COMPONENTS = [
  'course.image-text-block',
  'course.interactive-block',
  'course.custom-embed-block',
];

type UploadedFile = {
  filepath: string;
  originalFilename?: string;
  newFilename?: string;
  mimetype?: string;
};

type SectionVideoComponent = {
  id?: number;
  videoUid?: string;
  durationSeconds?: number;
  status?: CloudflareVideoStatus;
  [key: string]: unknown;
};

type SectionVideoBlock = {
  __component: string;
  id?: number;
  video?: SectionVideoComponent | null;
  [key: string]: unknown;
};

function pickUploadedFile(ctx: any): UploadedFile | undefined {
  const files = (ctx.request.files ?? {}) as Record<string, UploadedFile | UploadedFile[]>;
  const candidate = files.file ?? files.video ?? Object.values(files)[0];
  return Array.isArray(candidate) ? candidate[0] : candidate;
}

/**
 * `blocks` is a dynamic zone now (see api::section.section's schema), so a
 * section's video no longer lives at a single well-known path — it's the
 * `video` component nested inside whichever `course.video-block` entry the
 * caller means. `:blockIndex` (from the route) is that entry's position in
 * the `blocks` array, which is also exactly the array index the admin's
 * upload widget reads off its own field path (see
 * ../../../admin/extensions/video-upload/Input.tsx) — so both the
 * server-to-server content-API route and the admin-panel route address a
 * block the same way.
 *
 * IMPORTANT: `on` must list every component type the `blocks` dynamic zone
 * can hold (VIDEO_BLOCK_COMPONENT + OTHER_BLOCK_COMPONENTS), even though we
 * only care about video-blocks. Strapi's dynamic-zone populate resolver
 * uses the `on` map as an allowlist and silently drops any block whose
 * `__component` isn't a key of it from the returned `blocks` array — so a
 * populate that only listed VIDEO_BLOCK_COMPONENT would return a *filtered,
 * compacted* array (only the video-blocks, in order), and `blockIndex`
 * (the block's position in the section's true, full blocks array — see
 * the admin widget) would then point at the wrong entry, or none, for any
 * section where a non-video block appears before the target video block.
 * This was a real bug (surfaced as "No Video Block found at blocks[N]"
 * errors), so the non-video types above are given `true` — just enough to
 * keep them in the result — while only the video-block gets its `video`
 * component actually populated. The update below writes directly to the
 * `shared.cloudflare-video` component row via its own id (see
 * uploadVideo/refreshVideoStatus), never by resending the whole `blocks`
 * array, so there's no need (and no risk of accidentally clobbering
 * sibling blocks' media/relations) in populating those other types' own
 * fields.
 */
async function findVideoBlock(
  strapi: any,
  documentId: string,
  blockIndex: number,
): Promise<{ section: any; block: SectionVideoBlock | null }> {
  const section = await strapi.documents('api::section.section').findOne({
    documentId,
    populate: {
      blocks: {
        on: {
          [VIDEO_BLOCK_COMPONENT]: { populate: { video: true } },
          // `true` is enough here — these are only present so Strapi keeps them in the returned
          // `blocks` array (see the OTHER_BLOCK_COMPONENTS comment above); their own fields/nested
          // relations are never read by this controller.
          ...Object.fromEntries(OTHER_BLOCK_COMPONENTS.map((uid) => [uid, true])),
        },
      },
    },
  });

  if (!section) return { section: null, block: null };

  const blocks: SectionVideoBlock[] = Array.isArray(section.blocks) ? section.blocks : [];
  const block = blocks[blockIndex];
  if (!block || block.__component !== VIDEO_BLOCK_COMPONENT) {
    return { section, block: null };
  }
  return { section, block };
}

export default factories.createCoreController('api::section.section', ({ strapi }) => ({
  /**
   * POST /api/sections/:id/video/:blockIndex
   * multipart/form-data with the video under a `file` (or `video`) field.
   *
   * `:id` is the section's documentId (Strapi 5 Document Service API).
   * `:blockIndex` is the zero-based position of a `course.video-block`
   * entry within that section's `blocks` dynamic zone — add a Video Block
   * to the section in the admin and save (as a draft is fine; draftAndPublish
   * skips required-field validation until Publish) before uploading, same
   * as the section itself previously had to be saved once before its old
   * single `video` field could be uploaded to.
   *
   * Uploads the file straight to Cloudflare Stream (server-to-server) and
   * writes the resulting UID/status/duration directly onto that block's
   * `video` (shared.cloudflare-video) component row — see the comment on
   * findVideoBlock for why this updates the component row in place instead
   * of resending the whole `blocks` array. Strapi's media library / S3
   * provider is intentionally NOT involved — video never becomes a Strapi
   * upload-plugin asset, matching how this project's other media (images,
   * narration audio, .glb scans) goes to S3 while video goes to Stream.
   */
  async uploadVideo(ctx: any) {
    const { id: documentId, blockIndex: blockIndexParam } = ctx.params;
    const blockIndex = Number(blockIndexParam);

    if (!Number.isInteger(blockIndex) || blockIndex < 0) {
      return ctx.badRequest(
        'blockIndex must be a non-negative integer — the position of the Video Block within this section\'s blocks list.',
      );
    }

    const file = pickUploadedFile(ctx);
    if (!file) {
      return ctx.badRequest(
        'No video file provided. Send it as multipart/form-data under the "file" field.',
      );
    }

    if (file.mimetype && !file.mimetype.startsWith(VIDEO_MIME_PREFIX)) {
      await fs.unlink(file.filepath).catch(() => {});
      return ctx.badRequest(`Expected a video file, got "${file.mimetype}".`);
    }

    const { section, block } = await findVideoBlock(strapi, documentId, blockIndex);

    if (!section) {
      await fs.unlink(file.filepath).catch(() => {});
      return ctx.notFound(`Section ${documentId} not found.`);
    }
    if (!block) {
      await fs.unlink(file.filepath).catch(() => {});
      return ctx.badRequest(
        `No Video Block found at blocks[${blockIndex}] on section ${documentId}. Add a Video Block to this section's Blocks list and save it first.`,
      );
    }
    if (!block.video?.id) {
      await fs.unlink(file.filepath).catch(() => {});
      return ctx.badRequest(
        `blocks[${blockIndex}] has no video component yet — add the video field inside the Video Block and save before uploading.`,
      );
    }

    let streamResult;
    try {
      streamResult = await uploadVideoToCloudflareStream(
        file.filepath,
        file.originalFilename ?? file.newFilename ?? 'video.mp4',
      );
    } catch (error) {
      strapi.log.error('[section.uploadVideo] Cloudflare Stream upload failed', error);
      return ctx.internalServerError(
        error instanceof Error ? error.message : 'Cloudflare Stream upload failed.',
      );
    } finally {
      await fs.unlink(file.filepath).catch(() => {});
    }

    const updatedVideo = await strapi.db.query('shared.cloudflare-video').update({
      where: { id: block.video.id },
      data: {
        videoUid: streamResult.uid,
        status: streamResult.status,
        ...(streamResult.durationSeconds !== undefined
          ? { durationSeconds: streamResult.durationSeconds }
          : {}),
      },
    });

    ctx.body = { data: { video: updatedVideo } };
  },

  /**
   * GET /api/sections/:id/video/:blockIndex/status
   *
   * Cloudflare Stream encodes asynchronously, so the status written at
   * upload time is usually still "pending"/"processing". Call this to
   * re-check with Cloudflare and sync that block's `video.status` (and
   * duration, once available) — poll it after upload, or wire it to a cron
   * job / admin action later.
   */
  async refreshVideoStatus(ctx: any) {
    const { id: documentId, blockIndex: blockIndexParam } = ctx.params;
    const blockIndex = Number(blockIndexParam);

    if (!Number.isInteger(blockIndex) || blockIndex < 0) {
      return ctx.badRequest(
        'blockIndex must be a non-negative integer — the position of the Video Block within this section\'s blocks list.',
      );
    }

    const { section, block } = await findVideoBlock(strapi, documentId, blockIndex);

    if (!section) {
      return ctx.notFound(`Section ${documentId} not found.`);
    }
    if (!block) {
      return ctx.badRequest(
        `No Video Block found at blocks[${blockIndex}] on section ${documentId}.`,
      );
    }
    if (!block.video?.id) {
      return ctx.badRequest(`blocks[${blockIndex}] has no video component yet.`);
    }

    const videoUid = block.video.videoUid;
    if (!videoUid) {
      return ctx.badRequest('This block has no video.videoUid to look up yet.');
    }

    let streamResult;
    try {
      streamResult = await getCloudflareStreamStatus(videoUid);
    } catch (error) {
      strapi.log.error(
        '[section.refreshVideoStatus] Cloudflare Stream status lookup failed',
        error,
      );
      return ctx.internalServerError(
        error instanceof Error ? error.message : 'Cloudflare Stream status lookup failed.',
      );
    }

    const updatedVideo = await strapi.db.query('shared.cloudflare-video').update({
      where: { id: block.video.id },
      data: {
        status: streamResult.status,
        ...(streamResult.durationSeconds !== undefined
          ? { durationSeconds: streamResult.durationSeconds }
          : {}),
      },
    });

    ctx.body = { data: { video: updatedVideo } };
  },
}));
