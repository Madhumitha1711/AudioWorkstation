// --- Raw studio-cms (Strapi 5) response shapes -----------------------------
// Loose/partial on purpose: this is just enough shape to read the fields the
// mapper below needs. Strapi 5 flattens attributes directly onto each entry
// (no `.attributes` wrapper like Strapi 4), and media/component fields are
// flattened the same way.

export interface StrapiMedia {
  id?: number;
  url?: string;
  mime?: string | null;
  alternativeText?: string | null;
}

export interface StrapiCloudflareVideo {
  id?: number;
  videoUid?: string | null;
  durationSeconds?: number | null;
  captionsUrl?: string | null;
  status?: 'pending' | 'processing' | 'ready' | 'error';
  thumbnail?: StrapiMedia | null;
}

export interface StrapiAudioAsset {
  id?: number;
  label?: string | null;
  file?: StrapiMedia | null;
}

export interface StrapiAnswerOption {
  id?: number;
  text?: string;
}

export interface StrapiQuestion {
  id?: number;
  questionKey?: string | null;
  prompt?: string;
  options?: StrapiAnswerOption[];
  correctIndex?: number;
  explanation?: string | null;
  audioClips?: StrapiAudioAsset[];
}

export interface StrapiAssessment {
  id?: number;
  assessmentKey?: string | null;
  title?: string;
  questions?: StrapiQuestion[];
}

export interface StrapiInteractiveActivity {
  id?: number;
  activityKey?: string | null;
  title?: string;
  kind?: string;
}

// Strapi's "blocks" rich-text field: an array of block nodes, each with
// `children` (which may themselves nest, e.g. links). We only care about
// pulling the plain text back out.
export interface StrapiBlockNode {
  type?: string;
  text?: string;
  children?: StrapiBlockNode[];
}

// --- Section `blocks` dynamic zone (api::section.section's `blocks` field) -
// A Section's content is an ordered, mixed list of these four component
// shapes — see studio-cms's STRAPI_SCHEMA_NOTES.md "Section `blocks`
// dynamic zone" section. `__component` is Strapi 5's discriminant for a
// dynamic zone entry's type; array position is display order (no separate
// `order` field on each block — see the mapper's mapSectionBlock).

export interface StrapiVideoBlock {
  __component: 'course.video-block';
  id?: number;
  title?: string | null;
  caption?: string | null;
  video?: StrapiCloudflareVideo | null;
}

export interface StrapiImageTextBlock {
  __component: 'course.image-text-block';
  id?: number;
  heading?: string | null;
  content?: StrapiBlockNode[];
  images?: StrapiMedia[];
  imagePosition?: 'left' | 'right' | 'top' | 'text-only';
}

export interface StrapiInteractiveBlock {
  __component: 'course.interactive-block';
  id?: number;
  enabled?: boolean;
  activity?: StrapiInteractiveActivity | null;
}

export interface StrapiCustomEmbedBlock {
  __component: 'course.custom-embed-block';
  id?: number;
  componentKey?: string;
  title?: string | null;
  enabled?: boolean;
  config?: unknown;
}

export type StrapiSectionBlock =
  | StrapiVideoBlock
  | StrapiImageTextBlock
  | StrapiInteractiveBlock
  | StrapiCustomEmbedBlock;

// A Section (api::section.section — renamed from "Lesson"; see
// STRAPI_SCHEMA_NOTES.md). One narrated section within a Chapter. Its
// content lives entirely in `blocks` (the dynamic zone) — see
// course.mapper.ts's mapSectionBlock.
export interface StrapiSection {
  id?: number;
  documentId?: string;
  slug?: string;
  title?: string;
  duration?: string | null;
  order?: number;
  blocks?: StrapiSectionBlock[];
}

// A Main Topic (api::main-topic.main-topic) — one of the curriculum modules
// a Chapter is grouped under in studio-vr's course sidebar.
export interface StrapiMainTopic {
  id?: number;
  documentId?: string;
  slug?: string;
  title?: string;
  order?: number;
}

// A Chapter (api::chapter.chapter — renamed from "Course Topic"; see
// STRAPI_SCHEMA_NOTES.md). One chapter within a Main Topic, and the anchor
// for a VR hotspot when it has one.
export interface StrapiChapter {
  id?: number;
  documentId?: string;
  slug?: string;
  title?: string;
  room?: string | null;
  intro?: string;
  ready?: boolean;
  order?: number;
  number?: number | null;
  hotspotId?: string | null;
  mainTopic?: StrapiMainTopic | null;
  sections?: StrapiSection[];
  assessment?: StrapiAssessment | null;
  interactive?: StrapiInteractiveActivity | null;
}

export interface StrapiCollectionResponse<T> {
  data: T[];
  meta?: unknown;
}

// --- Reshaped output, matching studio-vr's src/course/courseData.js TOPICS[] ---

// `playbackToken` is a short-lived, signed Cloudflare Stream token (see
// ../assets/cloudflare-stream-token.service.ts), NOT the raw Stream
// videoUid — studio-vr's VideoPlayer embeds it as
// https://iframe.cloudflarestream.com/<playbackToken>. Renamed from
// `videoUid` on purpose: this field expires and is scoped to whoever
// requested it, so it shouldn't be mistaken for a stable, shareable video
// identifier the way a bare UID would be.
export interface CourseVideo {
  playbackToken: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  captionsUrl: string | null;
  status: string | null;
}

export interface CourseAudioClip {
  id: string;
  label: string | null;
  url: string | null;
}

export interface CourseAnswerQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  audioClips?: CourseAudioClip[];
}

export interface CourseAssessment {
  id: string;
  title: string;
  questions: CourseAnswerQuestion[];
}

export interface CourseInteractive {
  id: string;
  title: string;
  kind: string;
}

// --- Reshaped section blocks, matching studio-vr's SectionBlocks.jsx -------
// Mirrors StrapiSectionBlock 1:1 (see course.mapper.ts's mapSectionBlock)
// but with server-derived fields (presigned URLs, signed video tokens)
// swapped in and Strapi-internal shape (media objects, __component) reduced
// to what the frontend actually renders. `id` is a stable string derived
// from the component's own Strapi id (falling back to its array index) —
// safe to use as a React list key.

export interface CourseVideoBlock {
  type: 'video';
  id: string;
  title: string | null;
  caption: string | null;
  video?: CourseVideo;
}

export interface CourseImageTextBlock {
  type: 'image-text';
  id: string;
  heading: string | null;
  paragraphs: string[];
  images: { url: string | null; alt: string | null }[];
  imagePosition: 'left' | 'right' | 'top' | 'text-only';
}

export interface CourseInteractiveBlock {
  type: 'interactive';
  id: string;
  // Whether this interactive activity is turned on — see studio-cms's
  // course.interactive-block. studio-vr shows a disabled placeholder in
  // this block's position rather than mounting the lab when false.
  enabled: boolean;
  interactive?: CourseInteractive;
}

export interface CourseEmbedBlock {
  type: 'embed';
  id: string;
  // Free-text key studio-vr's customEmbedRegistry.js looks up to find the
  // React component to mount here — see studio-cms's
  // course.custom-embed-block. No component registered for this key yet ==
  // studio-vr renders a "not built yet" placeholder instead of this block's
  // real content.
  componentKey: string;
  title: string | null;
  enabled: boolean;
  config: unknown;
}

export type CourseSectionBlock =
  | CourseVideoBlock
  | CourseImageTextBlock
  | CourseInteractiveBlock
  | CourseEmbedBlock;

export interface CourseLesson {
  id: string;
  title: string;
  duration: string | null;
  // Ordered, mixed content for this section — replaces the old fixed
  // `paragraphs`/`video`/`model3d` fields (see STRAPI_SCHEMA_NOTES.md's
  // `blocks` dynamic zone). Render in array order; that order IS the
  // CMS-configured placement.
  blocks: CourseSectionBlock[];
}

export interface CourseTopic {
  id: string;
  room: string | null;
  title: string;
  intro: string;
  ready: boolean;
  // Curriculum-structure fields, now read straight off the Chapter's own
  // `number`/`hotspotId` fields and its `mainTopic` relation (see
  // course.mapper.ts) instead of a hardcoded/static lookup. `null` when a
  // chapter has no Main Topic assigned yet or no number/hotspot.
  module: string | null;
  moduleTitle: string | null;
  moduleOrder: number | null;
  number: number | null;
  hotspotId: string | null;
  // Field name kept as `lessons` (rather than renaming to `sections`) so
  // studio-vr's CoursePage.jsx/courseData.js don't need to change what they
  // read — only the CMS-side name changed (Lesson -> Section; see
  // STRAPI_SCHEMA_NOTES.md).
  lessons?: CourseLesson[];
  assessment?: CourseAssessment;
  interactive?: CourseInteractive;
}
