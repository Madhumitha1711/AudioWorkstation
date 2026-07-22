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

- **Course Topic** (`course-topic`) — one per course topic (Speakers,
  Mixing Console, DAW Workstation, …). Matches `TOPICS[]`. Has a
  `model3d` component (the `.glb` gear scan), a one-to-many relation to
  **Lesson**, a nested `assessment` component, and a nested `interactive`
  component.
- **Lesson** (`lesson`) — one narrated lesson within a topic. Matches
  `TOPICS[].lessons[]`. `content` is a rich-text (blocks) field replacing
  `paragraphs[]`; `video` is a `shared.cloudflare-video` component holding
  the Cloudflare Stream UID + S3 thumbnail.

## Components (`src/components/`)

- `shared/cloudflare-video` — `videoUid`, `durationSeconds`, `thumbnail`
  (S3 image), `captionsUrl`, `status`.
- `shared/model-asset` — `kind` + `.glb` file (S3).
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
  S3-compatible service (R2, MinIO, etc.) instead of real AWS.
- **Video** is *not* run through Strapi's upload plugin — there's no
  Strapi-maintained Cloudflare Stream provider. Instead, two custom routes on
  the lesson API (`src/api/lesson/routes/video-upload.ts` +
  `src/api/lesson/controllers/lesson.ts`, backed by
  `src/utils/cloudflare-stream.ts`) push the file to Cloudflare
  server-to-server and write the result onto the lesson automatically:

  - `POST /api/lessons/:documentId/video` — send the video file as
    `multipart/form-data` under a `file` field (`video` also works). The
    route uploads it to Cloudflare Stream, then updates that lesson's
    `video` component with the returned `videoUid`, `status`, and
    `durationSeconds` (once Cloudflare reports one). Requires
    `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` to be set.
  - `GET /api/lessons/:documentId/video/status` — re-checks encoding status
    with Cloudflare and syncs `video.status`/`video.durationSeconds` onto
    the lesson. Cloudflare encodes asynchronously, so a video usually stays
    `pending`/`processing` for a bit after upload — poll this (or call it
    from a cron job later) until it flips to `ready`.

  Both are plain content-API routes, so they use the same auth as everything
  else here — an API token as `Authorization: Bearer <token>` (see "Setup"
  below). A "custom"-scoped token needs those two actions explicitly granted
  under Settings -> API Tokens, since they're not part of the default CRUD
  set a full-access token already covers.

  **Admin UI:** the Lesson edit view's `video.videoUid` field is a custom
  field ("video-upload", registered in `src/index.ts` + `src/admin/app.tsx`,
  widget at `src/admin/extensions/video-upload/Input.tsx`) rather than a
  plain text box — it shows an "Upload video" / "Replace video" button that
  calls the route above directly, plus a "Check status" button for the
  status route. Content editors don't need Postman/curl for the common
  case; upload only works once the lesson has been saved at least once
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
  lesson-length clips but buffers it in memory/temp disk — for very large
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

On first boot Strapi will create the new tables/components. Then in the
admin:

1. **Settings → API Tokens → Create new API Token** — give it Read-only (or
   custom, scoped to just the two content types above) access. There is no
   `users-permissions` plugin in this project (end-user accounts/login live
   in the separate NestJS service instead), so there's no Public/Authenticated
   role to flip on — every content-API request needs this token as
   `Authorization: Bearer <token>`. Treat it as a server-side secret: call it
   from the NestJS service (or any other trusted backend), not directly from
   a browser. If studio-vr itself needs to hit Strapi directly one day,
   route that through a backend proxy rather than embedding the token
   client-side.
2. Enter content for each topic/lesson (or write a one-off seed script
   against the Documents API to bulk-import the existing `courseData.js`
   objects).

## Fetching from studio-vr

Example `qs`-style populate query to replace `courseData.js`'s `TOPICS`:

```
GET /api/course-topics?populate[lessons][populate][model3d][populate]=*
                       &populate[lessons][populate][video]=*
                       &populate[assessment][populate][questions][populate][options]=*
                       &populate[assessment][populate][questions][populate][audioClips][populate]=*
                       &populate[interactive]=*
                       &sort=order:asc
```

Note the explicit `[audioClips][populate]=*` — a bare `populate=*` on
`questions` populates the `audioClips` components themselves but not the
media file nested one level further inside each one, so it has to be
spelled out.

Not yet wired into studio-vr — `courseData.js` still works exactly as
before. Swapping it for an API call (e.g. a `useEffect` + `fetch` in
`CoursePage.jsx`) is a separate follow-up whenever you're ready to point
the frontend at the CMS.
