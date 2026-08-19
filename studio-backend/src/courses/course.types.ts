// --- Raw studio-cms (Strapi 5) response shapes -----------------------------
// Loose/partial on purpose: this is just enough shape to read the fields the
// mapper below needs. Strapi 5 flattens attributes directly onto each entry
// (no `.attributes` wrapper like Strapi 4), and media/component fields are
// flattened the same way.

export interface StrapiMedia {
  id?: number;
  url?: string;
  mime?: string | null;
}

export interface StrapiModelAsset {
  id?: number;
  kind?: string | null;
  file?: StrapiMedia | null;
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

// A Section (api::section.section — renamed from "Lesson"; see
// STRAPI_SCHEMA_NOTES.md). One narrated section within a Chapter.
export interface StrapiSection {
  id?: number;
  documentId?: string;
  slug?: string;
  title?: string;
  duration?: string | null;
  order?: number;
  content?: StrapiBlockNode[];
  video?: StrapiCloudflareVideo | null;
  model3d?: StrapiModelAsset | null;
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

// `type` tells studio-vr's CoursePage.jsx whether to render this asset with
// GearModelViewer (3D) or as a plain <img> — derived server-side from the
// uploaded file's mime type / extension (see course.mapper.ts's
// deriveAssetType), since the CMS's `shared.model-asset` component now
// accepts either a .glb/.gltf scan or any image. `url` is a presigned,
// time-limited S3 URL (see ../assets/asset-url.service.ts), not the raw
// studio-cms media URL.
export interface CourseModel {
  kind: string | null;
  url: string | null;
  mime: string | null;
  type: 'model' | 'image' | null;
}

export interface CourseVideo {
  videoUid: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  captionsUrl: string | null;
  status: string | null;
}

export interface CourseLesson {
  id: string;
  title: string;
  duration: string | null;
  paragraphs: string[];
  video?: CourseVideo;
  model?: CourseModel;
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
  model?: CourseModel;
  // Field name kept as `lessons` (rather than renaming to `sections`) so
  // studio-vr's CoursePage.jsx/courseData.js don't need to change what they
  // read — only the CMS-side name changed (Lesson -> Section; see
  // STRAPI_SCHEMA_NOTES.md).
  lessons?: CourseLesson[];
  assessment?: CourseAssessment;
  interactive?: CourseInteractive;
}
