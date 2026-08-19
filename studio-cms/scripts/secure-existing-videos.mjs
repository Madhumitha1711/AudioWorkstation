#!/usr/bin/env node
// One-off migration: retroactively locks down course videos that were
// uploaded to Cloudflare Stream BEFORE uploadVideoToCloudflareStream
// (src/utils/cloudflare-stream.ts) started setting `requiresignedurls:
// true` on every new upload. Without this, those older videos stay
// playable by anyone who has the bare videoUid (e.g. from a captured
// /courses response) via https://iframe.cloudflarestream.com/<uid> — which
// defeats the point of gating this paid course's video behind
// studio-backend's signed-token flow (see
// studio-backend/src/assets/cloudflare-stream-token.service.ts).
//
// Talks to two APIs:
//   1. studio-cms's own Strapi REST API, to enumerate every section that
//      has a video.videoUid (same auth model as scripts/seed-course-content.mjs
//      — a Strapi API token as `Authorization: Bearer <token>`).
//   2. Cloudflare Stream's REST API, to flip `requireSignedURLs` to true
//      for each of those UIDs.
//
// Usage (from studio-cms/):
//   1. Make sure .env has STRAPI_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and
//      CLOUDFLARE_STREAM_API_TOKEN set (all already required for the normal
//      upload flow — see .env.example).
//   2. npm run secure:videos
//      Add --dry-run to list which videos would be updated without calling
//      Cloudflare (no tokens required for a dry run against a reachable
//      Strapi instance; STRAPI_API_TOKEN is still needed to read sections).
//
// Safe to re-run: setting requireSignedURLs=true on a video that already
// has it set is a no-op as far as this script is concerned.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnvFile(resolve(__dirname, '../.env'));

const BASE_URL = process.env.STRAPI_BASE_URL || 'http://localhost:1337';
const API_TOKEN = process.env.STRAPI_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const STREAM_API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_TOKEN) {
  console.error(
    'STRAPI_API_TOKEN is not set. Add it to studio-cms/.env (see scripts/seed-course-content.mjs header) before running this script.',
  );
  process.exit(1);
}

if (!DRY_RUN && (!ACCOUNT_ID || !STREAM_API_TOKEN)) {
  console.error(
    'CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_STREAM_API_TOKEN are not set. Add them to studio-cms/.env, or run with --dry-run to preview without them.',
  );
  process.exit(1);
}

/** Minimal .env reader — avoids depending on a package just for this script. */
function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function strapiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message ?? res.statusText;
    throw new Error(`GET ${path} -> ${res.status} ${message}`);
  }
  return body;
}

/** Every section that has a video with a videoUid, paginating through Strapi's default page size. */
async function findSectionsWithVideo() {
  const sections = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams();
    params.set('populate', 'video');
    params.set('pagination[page]', String(page));
    params.set('pagination[pageSize]', '100');
    const body = await strapiFetch(`/api/sections?${params.toString()}`);
    for (const section of body.data ?? []) {
      if (section.video?.videoUid) sections.push(section);
    }
    const pageCount = body.meta?.pagination?.pageCount ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }
  return sections;
}

async function setRequireSignedUrls(videoUid) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${videoUid}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STREAM_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: videoUid, requireSignedURLs: true }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = payload?.errors?.map((e) => e.message).join('; ') || response.statusText;
    throw new Error(`Cloudflare Stream requireSignedURLs update failed for ${videoUid}: ${message}`);
  }
}

async function main() {
  const sections = await findSectionsWithVideo();
  if (!sections.length) {
    console.log('No sections with a video.videoUid found — nothing to secure.');
    return;
  }

  console.log(`Found ${sections.length} section(s) with a video:`);
  for (const section of sections) {
    const uid = section.video.videoUid;
    if (DRY_RUN) {
      console.log(`[dry-run] would set requireSignedURLs=true for "${section.slug ?? section.documentId}" (${uid})`);
      continue;
    }
    try {
      await setRequireSignedUrls(uid);
      console.log(`Secured "${section.slug ?? section.documentId}" (${uid})`);
    } catch (error) {
      console.error(`Failed to secure "${section.slug ?? section.documentId}" (${uid}):`, error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
