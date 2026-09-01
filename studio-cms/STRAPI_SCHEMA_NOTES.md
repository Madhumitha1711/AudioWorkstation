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
  now part of this schema — plus a many-to-one relation to **Main Topic**,
  a one-to-many relation to **Section**, a nested `assessment` component,
  and a nested `interactive` component.
- **Section** (`section`) — one narrated section within a Chapter. Matches
  `TOPICS[].lessons[]`. Renamed from "Lesson"; the underlying `lessons` DB
  table/API is unchanged so existing content carried over. Its content is
  the `blocks` **dynamic zone**: an ordered, mixed list of `course.video-
  block`, `course.image-text-block`, `course.interactive-block`, and
  `course.custom-embed-block` entries — a section can now carry any
  combination of lesson video, image + text, and an interactive activity,
  in whatever order an editor drags them into in the admin (drag order IS
  display order — studio-backend's mapper doesn't re-sort `blocks`).

## Components (`src/components/`)

- `shared/cloudflare-video` — `videoUid`, `durationSeconds`, `thumbnail`
  (S3 image), `captionsUrl`, `status`.
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
- `course/block-layout` — `pairWithNext` + `columnWidths` + `verticalAlign`,
  nested as an optional `layout` field on each of the four block
  components below. Lets an editor lay a block side by side with the one
  right after it instead of stacking them — see "Side-by-side block
  layout" below.

### Section `blocks` dynamic zone

Four components, any of which can appear any number of times, in any
order, inside a Section's `blocks` field. Each one also carries an
optional `layout` field (`course.block-layout`) — see "Side-by-side block
layout" below.

- `course/video-block` — optional `title`/`caption` + a required nested
  `shared.cloudflare-video`. A section can now carry more than one video,
  each in its own position.
- `course/image-text-block` — optional `heading`, required rich-text
  `content` (same "blocks" type Section's old `content` field used), an
  optional repeatable `images` (S3), and an `imagePosition` enum
  (`left`/`right`/`top`/`text-only`) controlling how studio-vr lays the
  image(s) out next to the text.
- `course/interactive-block` — wraps `course/interactive-activity` with an
  `enabled` boolean (default `true`). This is the on/off switch for "the
  interactive part" of a section: turning it off keeps the block (and its
  configured activity) in place in the CMS but tells studio-vr to render a
  disabled placeholder instead of mounting the lab — useful for authoring
  an activity ahead of time, or pulling one temporarily, without losing its
  position in the section.
- `course/custom-embed-block` — `componentKey` (free text, same pattern as
  `interactive-activity.kind`), optional `title`, an `enabled` boolean, and
  a freeform `config` JSON field. This is the escape hatch for a frontend
  component that doesn't exist yet: an editor can place it in a section's
  block order and configure it now, and studio-vr's
  `src/course/customEmbedRegistry.js` maps `componentKey` to a real React
  component once one is built — until then studio-vr renders a visible
  "not built yet" placeholder rather than silently dropping the block.

**Heading hierarchy inside a Section:** studio-vr renders a Section's own
`title` as a large lesson heading above its `blocks` (see
`studio-vr/src/pages/CoursePage.jsx`'s `.lesson-title`). A
`course.interactive-block`'s nested `activity.title` used to reuse that
same large-heading style, so a Section like "Harmonics" whose one block is
an interactive activity titled "Harmonics: The Stack Above the
Fundamental" rendered as two near-identical, equally-weighted headings
back to back. `activity.title` now renders at `.block-heading` size — the
same weight `video-block`/`image-text-block` already use for their own
optional headings — whenever the activity is embedded in a Section's
`blocks` (it still renders full-size when it's a Chapter's own standalone
`interactive` field, i.e. a dedicated "Lab" step with no Section heading
above it). See the field descriptions on `Section.title` and
`interactive-activity.title` in the admin, and
`studio-vr/src/course/InteractiveSection.jsx` / `SectionBlocks.css` for
the frontend side of this.

`interactive-activity.title` is optional, not required — leave it blank in
the admin and studio-vr skips the heading entirely (same treatment as a
blank `video-block.title`/`image-text-block.heading`) rather than showing
an empty one. The one place this needs a fallback rather than just
disappearing is the course sidebar: a Chapter's own standalone
`interactive` field (a dedicated "Lab" step, not embedded in a Section) is
also that step's nav-list entry, and a nav row can't just render nothing —
`CoursePage.jsx` falls a blank title back to "Untitled activity" there.
studio-backend passes a real `null` through for a blank title (see
`course.mapper.ts`'s `mapInteractive`) rather than `''`, precisely so
studio-vr can tell "left blank" apart from some future non-empty-but-
falsy edge case and make that call.

Placement is inherent to the zone: there's no separate `order` field on
each block, because a dynamic zone's array position *is* its display
position — reordering in the admin (drag-and-drop) is reordering in the
rendered page.

### Side-by-side block layout

By default every block in a Section's `blocks` list stacks full-width, top
to bottom — that's still what happens when a block's `layout` field is
left empty. To put two blocks side by side instead (e.g. an image-text
block on the left and its matching interactive activity on the right),
turn on `layout.pairWithNext` on the *first* of the two blocks in the
list. `layout.columnWidths` (`even` / `this-wide` / `this-narrow`) and
`layout.verticalAlign` (`top` / `center` / `stretch`) — both also read off
that first block — control the row's column split and how the two columns
line up if they end up different heights.

There's deliberately no separate "Row" component to add to the zone
(Strapi's admin doesn't support a dynamic zone nested inside a component,
so a `course.row-block` wrapping its own `columns` zone wasn't an option —
see the Strapi forum thread on nesting dynamic zones). Instead,
studio-backend's `course.mapper.ts` (`groupBlocksIntoRows`) walks the
already-ordered `blocks` array after mapping each one individually and
folds a `pairWithNext`-flagged block together with the block right after
it into one `{ type: 'row', columns: [...] }` entry, so studio-vr's
`SectionBlocks.jsx` only ever has to render one more flat block type
("row", alongside "video"/"image-text"/"interactive"/"embed") rather than
know anything about pairing. Pairing only ever looks exactly one block
ahead: `pairWithNext` on the last block in the list, or on a block that's
itself already the second half of an earlier pair, is a no-op — a row is
always exactly two columns, and content simply falls back to stacking
full-width instead of erroring.

## Media storage

- **Images, narration audio, docs** go through Strapi's upload plugin into
  **S3** — wired up in `config/plugins.ts` via
  `@strapi/provider-upload-aws-s3` (added to `package.json`). Fill in
  `AWS_ACCESS_KEY_ID` / `AWS_ACCESS_SECRET` / `AWS_REGION` / `AWS_BUCKET` in
  `.env` (see `.env.example`). `AWS_ENDPOINT` is only needed for an
  S3-compatible service (R2, MinIO, etc.) instead of real AWS. Strapi's raw
  media `url` is never handed to the browser directly — studio-backend
  presigns it (e.g. a `course.image-text-block`'s `images`) before
  returning course data (see `studio-backend/src/assets/asset-url.service.ts`),
  so the S3 bucket itself doesn't need to be publicly readable.
- **Video** is *not* run through Strapi's upload plugin — there's no
  Strapi-maintained Cloudflare Stream provider. Instead, two custom routes on
  the section API (`src/api/section/routes/video-upload.ts` +
  `src/api/section/controllers/section.ts`, backed by
  `src/utils/cloudflare-stream.ts`) push the file to Cloudflare
  server-to-server and write the result onto the section automatically:

  - `POST /api/sections/:documentId/video/:blockIndex` — send the video
    file as `multipart/form-data` under a `file` field (`video` also
    works). `:blockIndex` is the zero-based position of a
    `course.video-block` entry in that section's `blocks` array (add one
    via the admin's Blocks zone and save — even as a draft, since
    draftAndPublish skips required-field validation until Publish — before
    uploading, so the block exists to upload into). The route uploads the
    file to Cloudflare Stream, then updates that block's nested `video`
    component with the returned `videoUid`, `status`, and
    `durationSeconds` (once Cloudflare reports one). Requires
    `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` to be set.
  - `GET /api/sections/:documentId/video/:blockIndex/status` — re-checks
    encoding status with Cloudflare and syncs that block's
    `video.status`/`video.durationSeconds`. Cloudflare encodes
    asynchronously, so a video usually stays `pending`/`processing` for a
    bit after upload — poll this (or call it from a cron job later) until
    it flips to `ready`.

  **Gotcha — `on` populate is an allowlist, not a filter on nesting:**
  `findVideoBlock()` in `controllers/section.ts` looks up
  `blocks[blockIndex]` after populating with `on: { 'course.video-block':
  {...} }`. If that `on` map only lists `course.video-block`, Strapi's
  dynamic-zone populate resolver drops every OTHER block type from the
  returned `blocks` array entirely (not just leaves it unpopulated) — so the
  array comes back shorter/compacted, and `blockIndex` (computed from the
  section's true, full blocks array by the admin widget) ends up pointing
  at the wrong entry, or past the end, for any section with a non-video
  block before the target video block. This caused real "No Video Block
  found at blocks[N]... Add a Video Block ... and save it first" errors even
  when the block clearly existed and was saved. The fix: `on` must list
  every component type the dynamic zone can hold (`true` is enough for the
  ones this controller doesn't otherwise care about) so Strapi keeps them
  in the array and the indices stay aligned — see `OTHER_BLOCK_COMPONENTS`
  in that file. `CHAPTER_POPULATE` below already does this correctly (all
  four types are listed under `on`), which is why this only broke the
  upload/status routes, not the normal course-rendering fetch.

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
2. Enter content for each main topic/chapter/section by hand in the admin
   — Main Topics and Chapters first (Chapters connect to their Main Topic),
   then each Chapter's Sections, adding `blocks` (video/image+text/
   interactive/custom-embed) to each Section as needed.

## Fetching from studio-vr

studio-vr no longer calls Strapi directly — it fetches from
studio-backend's `/courses` endpoint (`src/course/useCourseTopics.js`),
which proxies Strapi with the same REST content-API querystring approach as
before (`StrapiService.get()` serializes the populate object with `qs`).
The one change is that `sections.blocks` is now a dynamic zone, and Strapi
5's `populate` for a dynamic zone's per-component-type fields needs the
polymorphic `on` form rather than a flat `populate[...]` chain. The
populate object (see `studio-backend/src/courses/courses.service.ts`'s
`CHAPTER_POPULATE`) is:

```js
{
  mainTopic: true,
  sections: {
    populate: {
      blocks: {
        on: {
          'course.video-block': { populate: { video: { populate: '*' }, layout: true } },
          'course.image-text-block': { populate: { images: { populate: '*' }, layout: true } },
          'course.interactive-block': { populate: { activity: { populate: '*' }, layout: true } },
          'course.custom-embed-block': { populate: '*' },
        },
      },
    },
  },
  assessment: {
    populate: {
      questions: {
        populate: {
          options: { populate: '*' },
          audioClips: { populate: '*' },
        },
      },
    },
  },
  interactive: { populate: '*' },
}
```

**Adding a field to one of these four block components later?** It has to be added
to this populate object too, not just the component's schema — this `on`
form only returns the nested fields named in it (unlike a bare
`populate: '*'`, which `course.custom-embed-block` gets away with here
because none of its own fields are themselves components/relations needing
a second populate level). `layout` above learned this the hard way: it
was added to all four block schemas but not to this query, so
`pairWithNext`/`columnWidths`/`verticalAlign` silently came back
`undefined` from Strapi — landing a paired block back as a normal
full-width one with no error anywhere — until this query caught up.

Note the explicit `[audioClips][populate]` — a bare `populate: '*'` on
`questions` populates the `audioClips` components themselves but not the
media file nested one level further inside each one, so it has to be
spelled out. Same idea for `blocks.on['course.video-block']`'s nested
`video` populate.

`studio-backend/src/courses/course.mapper.ts` reshapes the response back
into the same `TOPICS[]` shape `courseData.js` used to hardcode (plus
`module`/`moduleTitle`/`moduleOrder`, `number`, and `hotspotId`, all now
read straight off the Chapter/Main Topic records instead of a hardcoded
list), so if you add or edit content in the Strapi admin it shows up in
studio-vr without any frontend changes.
