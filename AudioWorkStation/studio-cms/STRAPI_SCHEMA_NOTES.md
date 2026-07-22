# Strapi schema for Studio VR courses

These content types/components mirror the data already hardcoded in
`studio-vr/src/course/courseData.js` and `studio-vr/src/panorama/roomsData.js`,
so the CMS can become the source of truth for course + tour content without
changing the shape the frontend expects.

**Auth note:** `@strapi/plugin-users-permissions` has been removed from this
project on purpose. Student accounts, login, and paid-access state are owned
by a separate NestJS service, not Strapi — Strapi is content-only here. See
"Setup" below for how content-API access now works (API tokens instead of
the Public role).

## Content types (`src/api/`)

- **Course Topic** (`course-topic`) — one per VR hotspot topic (Speakers,
  Mixing Console, DAW Workstation, …). Matches `TOPICS[]`. Has a
  `model3d` component (the `.glb` gear scan), a one-to-many relation to
  **Lesson**, a nested `assessment` component, and a nested `interactive`
  component.
- **Lesson** (`lesson`) — one narrated lesson within a topic. Matches
  `TOPICS[].lessons[]`. `content` is a rich-text (blocks) field replacing
  `paragraphs[]`; `video` is a `shared.cloudflare-video` component holding
  the Cloudflare Stream UID + S3 thumbnail.
- **Studio Room** (`studio-room`) — one per panorama stop. Matches `ROOMS[]`.
  `panorama` is an S3-backed image field; `ambience` and `links` are
  components; `hotspots` is a one-to-many relation to **Studio Hotspot**.
- **Studio Hotspot** (`studio-hotspot`) — one clickable gear marker. Matches
  `ROOMS[].markers[]`. Relates back to its `room` and (optionally) to the
  **Course Topic** it opens. `narrationAudio` is S3-backed.
- **Tour Setting** (`tour-setting`, single type) — holds `startRoom`,
  replacing `START_NODE_ID`.

`ROOMS[].interactiveMarkers[]` (the live-DSP EQ/Compressor hotspots) stayed a
repeatable component on Studio Room rather than its own content type, since
in the source data they're only ever two fixed entries tied to specific
Faust patches, not editorial content.

## Components (`src/components/`)

- `shared/cloudflare-video` — `videoUid`, `durationSeconds`, `thumbnail`
  (S3 image), `captionsUrl`, `status`.
- `shared/model-asset` — `kind` + `.glb` file (S3).
- `course/assessment`, `course/question`, `course/answer-option` — nested
  quiz structure; `correctIndex` is a 0-based index into `options`.
- `course/interactive-activity` — `kind` is free text (`speaker-lab`,
  `equalizer-lab`, …) so new labs don't require a schema change.
- `panorama/ambience`, `panorama/room-link`, `panorama/objective`,
  `panorama/interactive-marker`.

`room-link.targetRoomSlug` is a plain string (not a relation) so it can be
authored as the destination room's `slug` even before that room exists —
same pattern the original `nodeId` string used.

## Media storage

- **Images, narration audio, `.glb` scans, docs** go through Strapi's
  upload plugin into **S3** — wired up in `config/plugins.ts` via
  `@strapi/provider-upload-aws-s3` (added to `package.json`). Fill in
  `AWS_ACCESS_KEY_ID` / `AWS_ACCESS_SECRET` / `AWS_REGION` / `AWS_BUCKET` in
  `.env` (see `.env.example`). `AWS_ENDPOINT` is only needed for an
  S3-compatible service (R2, MinIO, etc.) instead of real AWS.
- **Video** is *not* run through Strapi's upload plugin — there's no
  Strapi-maintained Cloudflare Stream provider. Upload each lesson's video
  directly to Cloudflare Stream (dashboard or `POST
  https://api.cloudflare.com/client/v4/accounts/{account_id}/stream`), then
  paste the returned UID into that lesson's `video.videoUid` field.
  Cloudflare's default player embed is
  `https://iframe.cloudflarestream.com/<uid>`, and the HLS manifest is
  `https://customer-<subdomain>.cloudflarestream.com/<uid>/manifest/video.m3u8`
  (subdomain from the Stream dashboard).

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
   custom, scoped to just the five content types above) access. There is no
   `users-permissions` plugin in this project (end-user accounts/login live
   in the separate NestJS service instead), so there's no Public/Authenticated
   role to flip on — every content-API request needs this token as
   `Authorization: Bearer <token>`. Treat it as a server-side secret: call it
   from the NestJS service (or any other trusted backend), not directly from
   a browser. If studio-vr itself needs to hit Strapi directly one day,
   route that through a backend proxy rather than embedding the token
   client-side.
2. Enter content for each topic/lesson/room/hotspot (or write a one-off seed
   script against the Documents API to bulk-import the existing
   `courseData.js` / `roomsData.js` objects).

## Fetching from studio-vr

Example `qs`-style populate query to replace `courseData.js`'s `TOPICS`:

```
GET /api/course-topics?populate[model3d][populate]=*
                       &populate[lessons][populate]=*
                       &populate[assessment][populate][questions][populate]=*
                       &populate[interactive]=*
                       &sort=order:asc
```

And to replace `roomsData.js`'s `ROOMS`:

```
GET /api/studio-rooms?populate[panorama]=*
                      &populate[ambience]=*
                      &populate[links]=*
                      &populate[interactiveMarkers]=*
                      &populate[hotspots][populate]=*
                      &sort=order:asc
```

Neither of these is wired into studio-vr yet — `courseData.js` and
`roomsData.js` still work exactly as before. Swapping them for API calls
(e.g. a `useEffect` + `fetch` in `App.jsx`, or moving the fetch into
`PanoramaTour.jsx`/`CoursePage.jsx`) is a separate follow-up whenever you're
ready to point the frontend at the CMS.
