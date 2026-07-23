/**
 * Thin client for Cloudflare Stream's REST API.
 *
 * Video is intentionally NOT routed through Strapi's upload plugin (there's
 * no Strapi-maintained Stream provider). This module is what the custom
 * `POST /api/lessons/:id/video` route (src/api/lesson/controllers/lesson.ts)
 * uses to push a file to Cloudflare server-to-server and read back the
 * UID/status that gets written onto a lesson's `shared.cloudflare-video`
 * component.
 *
 * Not registered as a Strapi service on purpose — it lives outside `src/api`
 * so Strapi's loader doesn't try to treat it as an API resource. Import it
 * directly wherever it's needed.
 */

import fs from 'node:fs/promises';

export type CloudflareVideoStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface CloudflareStreamResult {
  uid: string;
  status: CloudflareVideoStatus;
  durationSeconds?: number;
  thumbnail?: string;
  playbackHlsUrl?: string;
}

interface CloudflareStreamApiVideo {
  uid: string;
  thumbnail?: string;
  duration?: number;
  status?: { state?: string; errorReasonText?: string };
  playback?: { hls?: string; dash?: string };
}

interface CloudflareStreamApiResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: CloudflareStreamApiVideo;
}

// Cloudflare's encoding states, collapsed down to the 4 values our
// `shared.cloudflare-video` component's `status` enum supports.
const STATE_TO_LESSON_STATUS: Record<string, CloudflareVideoStatus> = {
  pendingupload: 'pending',
  downloading: 'processing',
  queued: 'processing',
  inprogress: 'processing',
  ready: 'ready',
  error: 'error',
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env before uploading video to Cloudflare Stream (see .env.example).`
    );
  }
  return value;
}

function toLessonResult(video: CloudflareStreamApiVideo): CloudflareStreamResult {
  const state = video.status?.state ?? 'pendingupload';
  return {
    uid: video.uid,
    status: STATE_TO_LESSON_STATUS[state] ?? 'processing',
    durationSeconds:
      typeof video.duration === 'number' && video.duration > 0
        ? Math.round(video.duration)
        : undefined,
    thumbnail: video.thumbnail,
    playbackHlsUrl: video.playback?.hls,
  };
}

async function parseStreamResponse(response: Response, action: string): Promise<CloudflareStreamApiVideo> {
  const payload = (await response.json()) as CloudflareStreamApiResponse;

  if (!response.ok || !payload.success || !payload.result) {
    const message = payload.errors?.map((e) => e.message).join('; ') || response.statusText;
    throw new Error(`Cloudflare Stream ${action} failed: ${message}`);
  }

  return payload.result;
}

/**
 * Uploads a video file straight to Cloudflare Stream (server-to-server,
 * whole file buffered from disk into one multipart request) and returns the
 * info needed to populate a `shared.cloudflare-video` component.
 *
 * Fine for typical lesson-length clips. For very large files, prefer
 * Cloudflare's "direct creator upload" flow (request a one-time upload URL,
 * let the client/caller upload straight to Cloudflare, then poll or webhook
 * back) instead of buffering here.
 */
export async function uploadVideoToCloudflareStream(
  filePath: string,
  filename: string
): Promise<CloudflareStreamResult> {
  const accountId = getRequiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = getRequiredEnv('CLOUDFLARE_STREAM_API_TOKEN');

  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), filename);

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: form,
  });

  const result = await parseStreamResponse(response, 'upload');
  return toLessonResult(result);
}

/**
 * Re-checks encoding status for a video already uploaded to Stream.
 * Cloudflare encodes asynchronously, so the status returned at upload time
 * is usually still "pending"/"processing" — call this later (poll or via a
 * "refresh status" route) to pick up "ready".
 */
export async function getCloudflareStreamStatus(videoUid: string): Promise<CloudflareStreamResult> {
  const accountId = getRequiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = getRequiredEnv('CLOUDFLARE_STREAM_API_TOKEN');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );

  const result = await parseStreamResponse(response, 'status lookup');
  return toLessonResult(result);
}

/**
 * Deletes a video from Cloudflare Stream. Not currently wired into any
 * route — here so a future "replace video" or lesson-deletion lifecycle
 * hook can clean up orphaned Stream assets instead of leaking them.
 */
export async function deleteCloudflareStreamVideo(videoUid: string): Promise<void> {
  const accountId = getRequiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = getRequiredEnv('CLOUDFLARE_STREAM_API_TOKEN');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${apiToken}` } }
  );

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => null)) as CloudflareStreamApiResponse | null;
    const message = payload?.errors?.map((e) => e.message).join('; ') || response.statusText;
    throw new Error(`Cloudflare Stream delete failed: ${message}`);
  }
}
