#!/usr/bin/env node
// Seeds studio-cms (Strapi) with the course content that currently lives
// hardcoded in studio-vr/src/course/courseData.js, per the migration this
// project's STRAPI_SCHEMA_NOTES.md calls out ("write a one-off seed script
// against the Documents API to bulk-import the existing courseData.js
// objects"). Talks to Strapi's REST API directly with an API token — same
// auth model as everything else in this project (no users-permissions
// plugin here).
//
// Usage (from studio-cms/):
//   1. Start Strapi (`npm run develop`) and, in the admin, create an API
//      token under Settings -> API Tokens with write access to
//      course-topic and lesson (Full access is simplest).
//   2. Add that token to studio-cms/.env:
//        STRAPI_API_TOKEN=<token>
//        STRAPI_BASE_URL=http://localhost:1337   (optional; this is the default)
//   3. npm run seed:course
//      Add --dry-run to preview what would be created without writing
//      anything (no token required for a dry run).
//
// Safe to re-run: topics already present (matched by slug) are skipped
// rather than duplicated. Lessons are not individually deduped (they're
// only created the first time their parent topic is created), so if a
// topic already exists but you've since added lessons to courseData.js,
// add those by hand in the admin rather than re-running this script.
//
// Known gaps (can't be seeded from plain JSON, need real uploaded media):
//   - Lesson video (shared.cloudflare-video) — needs a real Cloudflare
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
const { TOPICS } = await import(courseDataUrl);

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

async function findTopicBySlug(slug) {
  const body = await strapiFetch(`/api/course-topics?filters[slug][$eq]=${encodeURIComponent(slug)}`);
  return body.data?.[0] ?? null;
}

async function createTopic(topic, order) {
  const payload = {
    slug: topic.id,
    title: topic.title,
    room: topic.room ?? null,
    intro: topic.intro,
    ready: Boolean(topic.ready),
    order,
    assessment: mapAssessment(topic.assessment),
    interactive: mapInteractive(topic.interactive),
    // Content types here have draftAndPublish on; setting publishedAt on
    // create publishes immediately instead of leaving a draft the public
    // find endpoint studio-backend calls wouldn't return.
    publishedAt: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`[dry-run] would create course-topic "${topic.id}" with ${topic.lessons?.length ?? 0} lesson(s)`);
    return { documentId: `dry-run-${topic.id}` };
  }

  const body = await strapiFetch('/api/course-topics', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  });
  return body.data;
}

async function createLesson(lesson, order, topicDocumentId, model) {
  const payload = {
    slug: lesson.id,
    title: lesson.title,
    duration: lesson.duration ?? null,
    order,
    content: paragraphsToBlocks(lesson.paragraphs),
    topic: { connect: [topicDocumentId] },
    ...(model && { model3d: { kind: model.kind } }),
    publishedAt: new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] would create lesson "${lesson.id}"${model ? ' (carries topic model3d)' : ''}`);
    return;
  }

  await strapiFetch('/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  });
}

async function main() {
  console.log(`Seeding studio-cms at ${BASE_URL}${DRY_RUN ? ' (dry run — nothing will be written)' : ''}...`);

  for (const [index, topic] of TOPICS.entries()) {
    const existing = !DRY_RUN && (await findTopicBySlug(topic.id));
    if (existing) {
      console.log(`- "${topic.id}" already exists (documentId ${existing.documentId}), skipping.`);
      continue;
    }

    const created = await createTopic(topic, index);
    console.log(`- created course-topic "${topic.id}"${topic.ready ? '' : ' (not ready)'}`);

    if (topic.lessons?.length) {
      for (const [lessonIndex, lesson] of topic.lessons.entries()) {
        // The topic-level `model` from courseData.js becomes the first
        // lesson's model3d — see course-topic.mapper.ts's deriveTopicModel
        // on the studio-backend side for the matching read path.
        const model = lessonIndex === 0 ? topic.model : undefined;
        await createLesson(lesson, lessonIndex, created.documentId, model);
        console.log(`  - created lesson "${lesson.id}"`);
      }
    }
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
