#!/usr/bin/env node
// Seeds studio-cms (Strapi) with the course content that currently lives
// hardcoded in studio-vr/src/course/courseData.js, per the migration this
// project's STRAPI_SCHEMA_NOTES.md calls out ("write a one-off seed script
// against the Documents API to bulk-import the existing courseData.js
// objects"). Talks to Strapi's REST API directly with an API token — same
// auth model as everything else in this project (no users-permissions
// plugin here).
//
// Seeds three content types, in dependency order:
//   1. Main Topic  — one per courseData.js MODULES[] entry (Foundations,
//      Monitoring, ...).
//   2. Chapter      — one per courseData.js TOPICS[] entry (Speakers, DAW
//      Workstation, ...), connected to its Main Topic, carrying `number`
//      and `hotspotId` directly (both now live on the Chapter schema).
//   3. Section      — one per TOPICS[].lessons[] entry, connected to its
//      parent Chapter.
//
// Usage (from studio-cms/):
//   1. Start Strapi (`npm run develop`) and, in the admin, create an API
//      token under Settings -> API Tokens with write access to
//      main-topic, chapter, and section (Full access is simplest).
//   2. Add that token to studio-cms/.env:
//        STRAPI_API_TOKEN=<token>
//        STRAPI_BASE_URL=http://localhost:1337   (optional; this is the default)
//   3. npm run seed:course
//      Add --dry-run to preview what would be created/backfilled without
//      writing anything (no token required for a dry run).
//
// Safe to re-run:
//   - Main topics already present (matched by slug) are skipped.
//   - Chapters already present (matched by slug) are NOT skipped outright
//     — if one is missing `number`/`hotspotId`/`mainTopic` (e.g. it was
//     seeded before this script learned about the Main Topic relation),
//     those fields are backfilled onto the existing entry in place. This
//     is what fixes already-seeded chapters after the schema migration,
//     without a full wipe-and-reseed.
//   - Sections are not individually deduped (they're only created the
//     first time their parent chapter is created), so if a chapter already
//     existed but you've since added sections to courseData.js, add those
//     by hand in the admin rather than re-running this script.
//
// Known gaps (can't be seeded from plain JSON, need real uploaded media):
//   - Section video (shared.cloudflare-video) — needs a real Cloudflare
//     Stream upload; courseData.js doesn't carry any video data today.
//   - The 3D model's actual .glb file — only the `kind` placeholder
//     identifier is seeded, matching what studio-vr's GearModelViewer
//     already falls back to without a real scan.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnvFile(resolve(__dirname, '../.env'));

const BASE_URL = process.env.STRAPI_BASE_URL || 'http://localhost:1337';
const API_TOKEN = process.env.STRAPI_API_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_TOKEN && !DRY_RUN) {
  console.error(
    'STRAPI_API_TOKEN is not set. Add it to studio-cms/.env (see scripts/seed-course-content.mjs header), or run with --dry-run to preview without one.',
  );
  process.exit(1);
}

const courseDataUrl = new URL('../../studio-vr/src/course/courseData.js', import.meta.url);
const { MODULES, TOPICS } = await import(courseDataUrl);

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

function paragraphsToBlocks(paragraphs = []) {
  return paragraphs.map((text) => ({
    type: 'paragraph',
    children: [{ type: 'text', text }],
  }));
}

function mapAssessment(assessment) {
  if (!assessment) return undefined;
  return {
    assessmentKey: assessment.id,
    title: assessment.title,
    questions: (assessment.questions ?? []).map((q) => ({
      questionKey: q.id,
      prompt: q.prompt,
      options: (q.options ?? []).map((text) => ({ text })),
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? null,
      // audioClips isn't populated here — see "Known gaps" above.
    })),
  };
}

function mapInteractive(interactive) {
  if (!interactive) return undefined;
  return {
    activityKey: interactive.id,
    title: interactive.title,
    kind: interactive.kind,
  };
}

async function strapiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message ?? res.statusText;
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status} ${message}`);
  }
  return body;
}

async function findBySlug(collection, slug, populate) {
  const params = new URLSearchParams();
  params.set('filters[slug][$eq]', slug);
  if (populate) params.set('populate', populate);
  const body = await strapiFetch(`/api/${collection}?${params.toString()}`);
  return body.data?.[0] ?? null;
}

async function createMainTopic(mod, order) {
  const payload = {
    slug: mod.id,
    title: mod.title,
    order,
    publishedAt: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`[dry-run] would create main-topic "${mod.id}"`);
    return { documentId: `dry-run-${mod.id}` };
  }

  const body = await strapiFetch('/api/main-topics', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  });
  return body.data;
}

async function createChapter(topic, order, mainTopicDocumentId) {
  const payload = {
    slug: topic.id,
    title: topic.title,
    room: topic.room ?? null,
    intro: topic.intro,
    ready: Boolean(topic.ready),
    order,
    number: topic.number ?? null,
    hotspotId: topic.hotspotId ?? null,
    mainTopic: mainTopicDocumentId ? { connect: [mainTopicDocumentId] } : undefined,
    assessment: mapAssessment(topic.assessment),
    interactive: mapInteractive(topic.interactive),
    // Content types here have draftAndPublish on; setting publishedAt on
    // create publishes immediately instead of leaving a draft the public
    // find endpoint studio-backend calls wouldn't return.
    publishedAt: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`[dry-run] would create chapter "${topic.id}" with ${topic.lessons?.length ?? 0} section(s)`);
    return { documentId: `dry-run-${topic.id}` };
  }

  const body = await strapiFetch('/api/chapters', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  });
  return body.data;
}

async function backfillChapter(existing, topic, mainTopicDocumentId) {
  const data = {
    number: topic.number ?? null,
    hotspotId: topic.hotspotId ?? null,
    ...(mainTopicDocumentId && { mainTopic: { connect: [mainTopicDocumentId] } }),
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] would backfill number/hotspotId/mainTopic onto existing chapter "${topic.id}"`);
    return;
  }

  await strapiFetch(`/api/chapters/${existing.documentId}`, {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
}

async function createSection(section, order, chapterDocumentId, model) {
  const payload = {
    slug: section.id,
    title: section.title,
    duration: section.duration ?? null,
    order,
    content: paragraphsToBlocks(section.paragraphs),
    chapter: { connect: [chapterDocumentId] },
    ...(model && { model3d: { kind: model.kind } }),
    publishedAt: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] would create section "${section.id}"${model ? ' (carries chapter model3d)' : ''}`);
    return;
  }

  await strapiFetch('/api/sections', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  });
}

async function main() {
  console.log(`Seeding studio-cms at ${BASE_URL}${DRY_RUN ? ' (dry run — nothing will be written)' : ''}...`);

  const mainTopicIdByModuleId = new Map();

  console.log('Main topics:');
  for (const [index, mod] of MODULES.entries()) {
    const existing = !DRY_RUN && (await findBySlug('main-topics', mod.id));
    if (existing) {
      console.log(`- "${mod.id}" already exists (documentId ${existing.documentId}), skipping.`);
      mainTopicIdByModuleId.set(mod.id, existing.documentId);
      continue;
    }

    const created = await createMainTopic(mod, index);
    console.log(`- created main-topic "${mod.id}"`);
    mainTopicIdByModuleId.set(mod.id, created.documentId);
  }

  console.log('Chapters:');
  for (const [index, topic] of TOPICS.entries()) {
    const mainTopicDocumentId = mainTopicIdByModuleId.get(topic.module);
    if (!mainTopicDocumentId) {
      console.warn(`  ! no main-topic found for module "${topic.module}" (chapter "${topic.id}").`);
    }

    const existing = !DRY_RUN && (await findBySlug('chapters', topic.id, 'mainTopic'));
    if (existing) {
      // Chapters seeded before this script learned about mainTopic/number/
      // hotspotId won't have them — backfill in place rather than skipping,
      // so re-running this script after the schema migration fixes
      // already-seeded chapters (this is what makes the course sidebar
      // populate again without a full wipe-and-reseed).
      const needsBackfill = existing.number == null || existing.hotspotId == null || !existing.mainTopic;
      if (needsBackfill) {
        await backfillChapter(existing, topic, mainTopicDocumentId);
        console.log(`- "${topic.id}" already existed — backfilled number/hotspotId/mainTopic.`);
      } else {
        console.log(`- "${topic.id}" already exists (documentId ${existing.documentId}), skipping.`);
      }
      continue;
    }

    const created = await createChapter(topic, index, mainTopicDocumentId);
    console.log(`- created chapter "${topic.id}"${topic.ready ? '' : ' (not ready)'}`);

    if (topic.lessons?.length) {
      for (const [sectionIndex, section] of topic.lessons.entries()) {
        // The chapter-level `model` from courseData.js becomes the first
        // section's model3d — see course.mapper.ts's deriveTopicModel on
        // the studio-backend side for the matching read path.
        const model = sectionIndex === 0 ? topic.model : undefined;
        await createSection(section, sectionIndex, created.documentId, model);
        console.log(`  - created section "${section.id}"`);
      }
    }
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
