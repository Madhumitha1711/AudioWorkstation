# Strapi schema for Studio VR courses

These content types/components mirror the data already hardcoded in
`studio-vr/src/course/courseData.js`, so the CMS can become the source of
truth for `/course` page content without changing the shape the frontend
expects.

This CMS is scoped to the `/course` route only. Content types and
components that would have backed the `/studio` panorama tour route
(Studio Room, Studio Hotspot, Tour Setting, and the `panorama.*`
components) have been removed.

**Auth note:** `@strapi/plugin-users-permissions` has been removed from this
project on purpose. Student accounts, login, and paid-access state are owned
by a separate NestJS service, not Strapi — Strapi is content-only here. See
"Setup" below for how content-API access now works (API tokens instead of
the Public role).

## Content types (`src/api/`)

Three levels, matching studio-vr's own structure: a **Main Topic** (one of
the 7 curriculum modules) has many **Chapters**; each **Chapter** has many
**Sections** and its own **Assessment**.

- **Main Topic** (`main-topic`) — one per curriculum module (Foundations,
  Room & Acoustics, Monitoring, …). Matches `MODULES[]`. Has a one-to-many
  relation to **Chapter**. This is what studio-vr's course sidebar groups
  chapters under.
- **Chapter** (`chapter`) — one per course chapter (Speakers, Mixing
  Console, DAW Workstation, …). Matches `TOPICS[]`. Renamed from "Course
  Topic"; the underlying `course_topics` DB table/API is unchanged so
  existing content carried over. Has a `number` (chapter number in the
  25-chapter syllabus) and `hotspotId` (VR-tour hotspot anchor) field —
  both used to only live in studio-vr's hardcoded `courseData.js` and are
  now part of this schema — plus a `model3d` component (the `.glb` gear
  scan, actually stored on the chapter's first Section), a many-to-one
  relation to **Main Topic**, a one-to-many relation to **Section**, a
  nested `assessment` component, and a nested `interactive` component.
- **Section** (`section`) — one narrated section within a Chapter. Matches
  `TOPICS[].lessons[]`. Renamed from "Lesson"; the underlying `lessons` DB
  table/API is unchanged so existing content carried over. `content` is a
  rich-text (blocks) field replacing `paragraphs[]`; `video` is a
  `shared.cloudflare-video` component holding the Cloudflare Stream UID +
  S3 thumbnail.

## Components (`src/components/`)

- `shared/cloudflare-video` — `videoUid`, `durationSeconds`, `thumbnail`
  (S3 image), `captionsUrl`, `status`.
- `shared/model-asset` — `kind` + a file that's either a `.glb`/`.gltf`
  scan or a plain image (S3, `allowedTypes: ["files", "images"]`);
  studio-vr picks which one to render off the file's mime type (see
  studio-backend's `course.mapper.ts` `deriveAssetType`).
- `shared/audio-asset` — `label` + an audio file (S3, `allowedTypes:
  ["audios"]`). Used by `course/question.audioClips` for ear-training-style
  questions that need the student to listen to something before answering
  (e.g. a "Before"/"After" pair).
- `course/assessment`, `course/question`, `course/answer-option` — nested
  quiz structure; `correctIndex` is a 0-based index into `options`.
  `course/question` also has a repeatable `audioClips`
  (`shared.audio-asset`) field, empty for ordinary text-only questions.
- `course/interactive-activity` — `kind` is free text (`speaker-lab`,
  `equalizer-lab`, …) so new labs don't require a schema change.

## Media storage

- **Images, narration audio, `.glb` scans, docs** go through Strapi's
  upload plugin into **S3** — wired up in `config/plugins.ts` via
  `@strapi/provider-upload-aws-s3` (added to `package.json`). Fill in
  `AWS_ACCESS_KEY_ID` / `AWS_ACCESS_SECRET` / `AWS_REGION` / `AWS_BUCKET` in
  `.env` (see `.env.example`). `AWS_ENDPOINT` is only needed for an
  S3-compatible service (R2, MinIO, etc.) instead of real AWS. Strapi's raw
  media `url` is never handed to the browser directly — studio-backend
  rewrites `model3d.file.url` into a short-lived presigned URL before
  returning course data (see `studio-backend/src/assets/asset-url.service.ts`),
  so the S3 bucket itself doesn't need to be publicly readable.
- **Video** is *not* run through Strapi's upload plugin — there's no
  Strapi-maintained Cloudflare Stream provider. Instead, two custom routes on
  the section API (`src/api/section/routes/video-upload.ts` +
  `src/api/section/controllers/section.ts`, backed by
  `src/utils/cloudflare-stream.ts`) push the file to Cloudflare
  server-to-server and write the result onto the section automatically:

  - `POST /api/sections/:documentId/video` — send the video file as
    `multipart/form-data` under a `file` field (`video` also works). The
    route uploads it to Cloudflare Stream, then updates that section's
    `video` component with the returned `videoUid`, `status`, and
    `durationSeconds` (once Cloudflare reports one). Requires
    `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` to be set.
  - `GET /api/sections/:documentId/video/status` — re-checks encoding status
    with Cloudflare and syncs `video.status`/`video.durationSeconds` onto
    the section. Cloudflare encodes asynchronously, so a video usually stays
    `pending`/`processing` for a bit after upload — poll this (or call it
    from a cron job later) until it flips to `ready`.

  Both are plain content-API routes, so they use the same auth as everything
  else here — an API token as `Authorization: Bearer <token>` (see "Setup"
  below). A "custom"-scoped token needs those two actions explicitly granted
  under Settings -> API Tokens, since they're not part of the default CRUD
  set a full-access token already covers.

  **Admin UI:** the Section edit view's `video.videoUid` field is a custom
  field ("video-upload", registered in `src/index.ts` + `src/admin/app.tsx`,
  widget at `src/admin/extensions/video-upload/Input.tsx`) rather than a
  plain text box — it shows an "Upload video" / "Replace video" button that
  calls the route above directly, plus a "Check status" button for the
  status route. Content editors don't need Postman/curl for the common
  case; upload only works once the section has been saved at least once
  (needs a `documentId`), and the page reloads after a successful upload so
  the rest of the form (status, duration) reflects what the route just
  wrote to the document.

  The manual fallback (Cloudflare dashboard, then paste the UID by hand)
  still works fine for one-offs — the route is just there to automate it.
  Cloudflare's default player embed is
  `https://iframe.cloudflarestream.com/<uid>`, and the HLS manifest is
  `https://customer-<subdomain>.cloudflarestream.com/<uid>/manifest/video.m3u8`
  (subdomain from the Stream dashboard).

  This uploads the whole file in one request, which is fine for typical
  section-length clips but buffers it in memory/temp disk — for very large
  files, switch to Cloudflare's "direct creator upload" (TUS) flow instead
  (request a one-time upload URL, upload straight to Cloudflare from the
  caller, then use `GET .../video/status` or a webhook to pick up
  completion).

## Setup

```bash
cd studio-cms
npm install                 # picks up @strapi/provider-upload-aws-s3
cp .env.example .env        # fill in APP_KEYS/secrets + AWS_* vars
npm run develop
```

On first boot Strapi will create the new tables/components (`chapter`/
`section` keep their old `course_topics`/`lessons` DB tables — see above —
so a Strapi instance that already had course content just gets new columns/
relations added, nothing is dropped). Then in the admin:

1. **Settings → API Tokens → Create new API Token** — give it Read-only (or
   custom, scoped to just the three content types above) access. There is no
   `users-permissions` plugin in this project (end-user accounts/login live
   in the separate NestJS service instead), so there's no Public/Authenticated
   role to flip on — every content-API request needs this token as
   `Authorization: Bearer <token>`. Treat it as a server-side secret: put it
   in `studio-backend/.env` as `STRAPI_API_TOKEN` (that service proxies
   Strapi for studio-vr — see `studio-backend/src/courses` — so the token
   never has to reach the browser).
2. Enter content for each main topic/chapter/section by hand in the admin,
   **or** run `scripts/seed-course-content.mjs` to bulk-import the existing
   `courseData.js` objects — see that script's header comment for setup.
   It needs its own token with *write* access (Full access is simplest for
   a one-off migration run); that can be a separate, temporary token from
   the read-only one studio-backend uses, or the same token if you gave it
   broader access. **If chapters were already seeded before this Main
   Topic / `number` / `hotspotId` schema migration**, re-running this
   script backfills those fields onto the existing chapters instead of
   skipping them — see the script's "Safe to re-run" note.

## Fetching from studio-vr

studio-vr no longer calls Strapi directly — it fetches from
studio-backend's `/courses` endpoint (`src/course/useCourseTopics.js`),
which proxies Strapi with this populate query:

```
GET /api/chapters?populate[mainTopic]=*
                  &populate[sections][populate][model3d][populate]=*
                  &populate[sections][populate][video]=*
                  &populate[assessment][populate][questions][populate][options]=*
                  &populate[assessment][populate][questions][populate][audioClips][populate]=*
                  &populate[interactive]=*
                  &sort=order:asc
```

Note the explicit `[audioClips][populate]=*` — a bare `populate=*` on
`questions` populates the `audioClips` components themselves but not the
media file nested one level further inside each one, so it has to be
spelled out.

`studio-backend/src/courses/course.mapper.ts` reshapes the response back
into the same `TOPICS[]` shape `courseData.js` used to hardcode (plus
`module`/`moduleTitle`/`moduleOrder`, `number`, and `hotspotId`, all now
read straight off the Chapter/Main Topic records instead of a hardcoded
list), so if you add or edit content in the Strapi admin it shows up in
studio-vr without any frontend changes.
