// --- Raw studio-cms (Strapi 5) response shapes -----------------------------
// Loose/partial on purpose: this is just enough shape to read the fields the
// mapper below needs. Strapi 5 flattens attributes directly onto each entry
// (no `.attributes` wrapper like Strapi 4), and media/component fields are
// flattened the same way.

export interface StrapiMedia {
  id?: number;
  url?: string;
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

export interface StrapiLesson {
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

export interface StrapiCourseTopic {
  id?: number;
  documentId?: string;
  slug?: string;
  title?: string;
  room?: string | null;
  intro?: string;
  ready?: boolean;
  order?: number;
  lessons?: StrapiLesson[];
  assessment?: StrapiAssessment | null;
  interactive?: StrapiInteractiveActivity | null;
}

export interface StrapiCollectionResponse<T> {
  data: T[];
  meta?: unknown;
}

// --- Reshaped output, matching studio-vr's src/course/courseData.js TOPICS[] ---

export interface CourseModel {
  kind: string | null;
  url: string | null;
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
  model?: CourseModel;
  lessons?: CourseLesson[];
  assessment?: CourseAssessment;
  interactive?: CourseInteractive;
}
