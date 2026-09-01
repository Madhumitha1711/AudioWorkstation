#!/usr/bin/env node
// Seeds/updates studio-cms content for chapter 1, "What Is Sound?" —
// the Main Topic (Foundations), the Chapter itself, and its six Sections
// (Frequency, Amplitude, Wavelength, Phase, Harmonics, Timbre), each
// wired up with the real interactive lab studio-vr now ships for that
// concept (src/course/interactive/{Frequency,Amplitude,Wavelength,Phase,
// Harmonics,Timbre}Lab.jsx, registered in InteractiveSection.jsx's LABS
// map as "frequency-lab" / "amplitude-lab" / "wavelength-lab" / "phase-
// lab" / "harmonics-lab" / "timbre-lab").
//
// Lesson copy (heading/lede paragraphs/formula line) is transcribed from
// design/what-is-sound-chapter.html, the mockup these labs were built to
// match — this script is the "configure it in studio-cms" half of that
// work, doing by API what STRAPI_SCHEMA_NOTES.md's Setup section describes
// doing by hand in the admin.
//
// Talks to studio-cms's own Strapi REST API only (see STRAPI_SCHEMA_NOTES.md
// for the schema this writes against: api::main-topic, api::chapter,
// api::section, and the course.image-text-block / course.interactive-block
// / course.interactive-activity components). Auth is a Strapi API token as
// `Authorization: Bearer <token>`, same as scripts/secure-existing-videos.mjs.
//
// Usage (from studio-cms/):
//   1. Make sure .env has STRAPI_API_TOKEN set to a token with create/update
//      access on main-topics, chapters, and sections (see
//      STRAPI_SCHEMA_NOTES.md's "Setup" section — a full-access token is
//      simplest for a one-off seed like this).
//   2. Have a Strapi instance reachable at STRAPI_BASE_URL (defaults to
//      http://localhost:1337) — `npm run develop` in another terminal.
//   3. node scripts/seed-what-is-sound-chapter.mjs
//      Add --dry-run to log what would be created/updated without writing
//      anything (no token required for a dry run against a reachable
//      Strapi instance — reads still need one if content already exists
//      and you want the "already exists, would update" detail; a dry run
//      against an unauthenticated Strapi will just report "would create"
//      for everything, since it can't check for existing entries).
//
// Safe to re-run: every entry is looked up by its `slug` first and updated
// in place (PUT) rather than duplicated if it already exists.
//
// Everything this script writes lands as a DRAFT (draftAndPublish is on
// for all three content types) — review it in the Strapi admin and hit
// Publish on the Main Topic, the Chapter, and each Section before it's
// visible to studio-vr's /courses endpoint (studio-backend's course mapper
// only serves published content, same as anything entered by hand).

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
    'STRAPI_API_TOKEN is not set. Add it to studio-cms/.env (see STRAPI_SCHEMA_NOTES.md\'s "Setup" section), or run with --dry-run to preview without one.',
  );
  process.exit(1);
}

/** Minimal .env reader — same as scripts/secure-existing-videos.mjs, avoids a dependency for this one script. */
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

async function strapiRequest(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.error?.message ?? res.statusText;
    throw new Error(`${method} ${path} -> ${res.status} ${message}`);
  }
  return payload;
}

async function findBySlug(pluralApiId, slug, populate) {
  const params = new URLSearchParams();
  params.set('filters[slug][$eq]', slug);
  if (populate) params.set('populate', populate);
  const body = await strapiRequest('GET', `/api/${pluralApiId}?${params.toString()}`);
  return body?.data?.[0] ?? null;
}

/** Rich-text (Strapi Blocks) paragraphs from plain strings — one paragraph node per string. */
function paragraphs(...lines) {
  return lines.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] }));
}

async function upsert(pluralApiId, slug, data, { populate } = {}) {
  const existing = await findBySlug(pluralApiId, slug, populate);
  if (DRY_RUN) {
    console.log(`[dry-run] would ${existing ? 'update' : 'create'} ${pluralApiId} "${slug}"`);
    return existing ?? { documentId: `dry-run-${slug}`, slug, ...data };
  }
  if (existing) {
    const result = await strapiRequest('PUT', `/api/${pluralApiId}/${existing.documentId}`, { data });
    console.log(`Updated ${pluralApiId} "${slug}" (${existing.documentId})`);
    return result.data;
  }
  const result = await strapiRequest('POST', `/api/${pluralApiId}`, { data: { slug, ...data } });
  console.log(`Created ${pluralApiId} "${slug}" (${result.data.documentId})`);
  return result.data;
}

/* ============================== CONTENT ============================== */

const MAIN_TOPIC = { slug: 'foundations', title: 'Foundations', order: 0 };

const CHAPTER = {
  slug: 'what-is-sound',
  title: 'What Is Sound?',
  intro:
    "Every mix decision you'll ever make rests on this — sound is vibration, and everything else (frequency, amplitude, phase, timbre) is just a way of describing how that vibration behaves.",
  number: 1,
  order: 1,
  ready: true,
  hotspotId: null,
  room: null,
};

// One Section per concept, matching design/what-is-sound-chapter.html's
// per-lesson panels 02–07 (lesson 01 "Sound & Travel" and the 08 quiz step
// aren't in scope here — the chapter's assessment/intro live separately).
// `activity.kind` must match a key in studio-vr's InteractiveSection.jsx
// LABS map.
const SECTIONS = [
  {
    slug: 'what-is-sound-frequency',
    title: 'Frequency: How Often the Cycle Repeats',
    duration: '4 min',
    order: 1,
    heading: 'Frequency: How Often the Cycle Repeats',
    lede: paragraphs(
      'Frequency is how many times per second that compression–rarefaction cycle repeats, measured in Hertz (Hz). More repetitions per second means a higher pitch; fewer means lower.',
      'Human hearing roughly spans 20 Hz (a low rumble you feel more than hear) to 20,000 Hz (a thin, bright hiss most people lose access to well before adulthood).',
      'f = cycles / second · range ≈ 20 Hz – 20 kHz',
    ),
    activityKey: 'frequency-interactive',
    activityTitle: 'Tone Generator',
    kind: 'frequency-lab',
  },
  {
    slug: 'what-is-sound-amplitude',
    title: 'Amplitude: How Far the Wave Pushes',
    duration: '3 min',
    order: 2,
    heading: 'Amplitude: How Far the Wave Pushes',
    lede: paragraphs(
      "Amplitude is how far the air molecules are displaced from their resting position — a bigger push means a louder sound. It's the height of the wave, not its speed of repetition.",
      'We perceive amplitude as loudness, usually expressed in decibels (dB) — a logarithmic scale, because hearing itself responds to loudness logarithmically, not linearly.',
      'Loudness ∝ amplitude² · measured in dB',
    ),
    activityKey: 'amplitude-interactive',
    activityTitle: 'Tone + Volume Slider',
    kind: 'amplitude-lab',
  },
  {
    slug: 'what-is-sound-wavelength',
    title: 'Wavelength: The Physical Size of a Cycle',
    duration: '4 min',
    order: 3,
    heading: 'Wavelength: The Physical Size of a Cycle',
    lede: paragraphs(
      "Wavelength is the physical distance one full cycle takes up in space — and it's directly tied to frequency through the speed of sound.",
      'Low frequencies have long wavelengths (a 40 Hz bass note is over 8 meters long — it wraps around furniture and corners), while high frequencies have short, directional wavelengths that behave more like a beam.',
      'λ = v / f (v ≈ 343 m/s in air)',
    ),
    activityKey: 'wavelength-interactive',
    activityTitle: 'Tone + Visual Wavelength',
    kind: 'wavelength-lab',
  },
  {
    slug: 'what-is-sound-phase',
    title: 'Phase: Where in the Cycle a Wave Sits',
    duration: '4 min',
    order: 4,
    heading: 'Phase: Where in the Cycle a Wave Sits',
    lede: paragraphs(
      'Phase describes where a wave is in its cycle at a given moment, measured in degrees (0°–360°). Two identical waves starting at the same instant are "in phase" — shift one, and their sum changes.',
      "In phase, waves reinforce each other and get louder. Exactly 180° apart, one wave's peaks line up with the other's troughs and they cancel — the principle behind phase cancellation, comb filtering, and noise-cancelling headphones.",
      '0° reinforcing · 180° cancelling',
    ),
    activityKey: 'phase-interactive',
    activityTitle: 'Wave A + Wave B → Sum',
    kind: 'phase-lab',
  },
  {
    slug: 'what-is-sound-harmonics',
    title: 'Harmonics: The Stack Above the Fundamental',
    duration: '5 min',
    order: 5,
    heading: 'Harmonics: The Stack Above the Fundamental',
    lede: paragraphs(
      "A real instrument almost never produces one pure frequency. Along with the fundamental — the note you'd name — it generates a stack of harmonics: whole-number multiples of that fundamental, all ringing at once.",
      "Add more harmonics and a tone gets brighter and more complex; strip them away and you're left with a plain sine wave. The specific mix of harmonic loudnesses is a huge part of what makes one instrument sound different from another.",
      'Harmonic n = n × fundamental',
    ),
    activityKey: 'harmonics-interactive',
    activityTitle: 'Fundamental + Spectrum',
    kind: 'harmonics-lab',
  },
  {
    slug: 'what-is-sound-timbre',
    title: 'Timbre: Same Note, Different Character',
    duration: '4 min',
    order: 6,
    heading: 'Timbre: Same Note, Different Character',
    lede: paragraphs(
      "Play the exact same note — same frequency, same loudness — on a flute, a violin, and a trumpet, and you'll instantly tell them apart. That's timbre: everything about a sound's character that isn't pitch or loudness.",
      'Timbre comes mostly from harmonic content (which overtones are present, and how loud) and envelope (how volume evolves over time). Below, four simplified voices play the same 440 Hz note so you can hear harmonic content alone doing the work.',
      'Timbre = harmonic content + envelope',
    ),
    activityKey: 'timbre-interactive',
    activityTitle: 'Same Pitch (A4 · 440 Hz), Four Voices',
    kind: 'timbre-lab',
  },
];

async function main() {
  const mainTopic = await upsert('main-topics', MAIN_TOPIC.slug, {
    title: MAIN_TOPIC.title,
    order: MAIN_TOPIC.order,
  });

  const chapter = await upsert('chapters', CHAPTER.slug, {
    title: CHAPTER.title,
    intro: CHAPTER.intro,
    number: CHAPTER.number,
    order: CHAPTER.order,
    ready: CHAPTER.ready,
    hotspotId: CHAPTER.hotspotId,
    room: CHAPTER.room,
    mainTopic: mainTopic.documentId,
  });

  for (const section of SECTIONS) {
    await upsert('sections', section.slug, {
      title: section.title,
      duration: section.duration,
      order: section.order,
      chapter: chapter.documentId,
      blocks: [
        {
          __component: 'course.image-text-block',
          heading: section.heading,
          content: section.lede,
          imagePosition: 'text-only',
        },
        {
          __component: 'course.interactive-block',
          enabled: true,
          activity: {
            activityKey: section.activityKey,
            title: section.activityTitle,
            kind: section.kind,
          },
        },
      ],
    });
  }

  console.log(
    `\nDone. ${DRY_RUN ? '(dry run — nothing was written)' : 'Review the Main Topic, Chapter, and each Section in the Strapi admin and Publish them — everything above was written as a draft.'}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
