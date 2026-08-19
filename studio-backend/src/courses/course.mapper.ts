import {
  CourseAnswerQuestion,
  CourseAssessment,
  CourseInteractive,
  CourseLesson,
  CourseModel,
  CourseTopic,
  CourseVideo,
  StrapiAssessment,
  StrapiBlockNode,
  StrapiChapter,
  StrapiInteractiveActivity,
  StrapiSection,
  StrapiModelAsset,
  StrapiCloudflareVideo,
} from './course.types';
import { AssetUrlService } from '../assets/asset-url.service';

const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? 0) - (b.order ?? 0);

/** Recursively pulls the plain text out of a Strapi "blocks" rich-text tree. */
function blockNodeText(node: StrapiBlockNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!node.children?.length) return '';
  return node.children.map(blockNodeText).join('');
}

/**
 * Strapi's "blocks" field replaces courseData.js's `paragraphs: string[]`.
 * Each top-level block (normally a paragraph node) becomes one entry,
 * matching how CoursePage.jsx renders `paragraphs.map((p) => <p>{p}</p>)`.
 */
function blocksToParagraphs(blocks?: StrapiBlockNode[]): string[] {
  if (!blocks?.length) return [];
  return blocks.map(blockNodeText).filter((text) => text.trim().length > 0);
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const MODEL_EXTENSIONS = /\.(glb|gltf)$/i;

/**
 * `shared.model-asset`'s `file` field now accepts either a .glb/.gltf scan
 * or a plain image (see studio-cms's model-asset.json) — this decides
 * which one studio-vr should render (GearModelViewer vs a plain <img>).
 * Prefers the uploaded file's mime type (reliable, Strapi always sets it)
 * and falls back to the file extension for anything with an unexpected/
 * missing mime (e.g. some S3-compatible providers omit it for .glb/.gltf,
 * which have no universally-registered MIME type).
 */
function deriveAssetType(
  mime: string | null | undefined,
  url: string | null | undefined,
): 'model' | 'image' | null {
  if (mime?.startsWith('image/')) return 'image';
  if (mime === 'model/gltf-binary' || mime === 'model/gltf+json') return 'model';

  const path = url ?? '';
  if (IMAGE_EXTENSIONS.test(path)) return 'image';
  if (MODEL_EXTENSIONS.test(path)) return 'model';
  return null;
}

/**
 * Reshapes a Strapi `shared.model-asset` component into the `CourseModel`
 * studio-vr reads, presigning the raw S3 URL along the way (see
 * AssetUrlService) so the bucket never needs to be publicly readable.
 */
async function mapModel(
  model: StrapiModelAsset | null | undefined,
  assets: AssetUrlService,
): Promise<CourseModel | undefined> {
  if (!model) return undefined;
  const rawUrl = model.file?.url ?? null;
  const mime = model.file?.mime ?? null;
  return {
    kind: model.kind ?? null,
    url: await assets.presign(rawUrl),
    mime,
    type: deriveAssetType(mime, rawUrl),
  };
}

function mapVideo(
  video?: StrapiCloudflareVideo | null,
): CourseVideo | undefined {
  if (!video) return undefined;
  return {
    videoUid: video.videoUid ?? null,
    durationSeconds: video.durationSeconds ?? null,
    thumbnailUrl: video.thumbnail?.url ?? null,
    captionsUrl: video.captionsUrl ?? null,
    status: video.status ?? null,
  };
}

// Output type/field name (`CourseLesson`) kept as-is even though the
// Strapi-side input is now a Section (renamed from Lesson) — see
// course.types.ts's CourseTopic.lessons comment.
async function mapLesson(
  section: StrapiSection,
  assets: AssetUrlService,
): Promise<CourseLesson> {
  return {
    id: section.slug ?? String(section.id ?? ''),
    title: section.title ?? '',
    duration: section.duration ?? null,
    paragraphs: blocksToParagraphs(section.content),
    video: mapVideo(section.video),
    model: await mapModel(section.model3d, assets),
  };
}

function mapAssessment(
  assessment: StrapiAssessment | null | undefined,
  chapterSlug: string,
): CourseAssessment | undefined {
  if (!assessment) return undefined;

  const questions: CourseAnswerQuestion[] = (assessment.questions ?? []).map(
    (question, index) => ({
      id: question.questionKey ?? `q${index + 1}`,
      prompt: question.prompt ?? '',
      options: (question.options ?? []).map((option) => option.text ?? ''),
      correctIndex: question.correctIndex ?? 0,
      explanation: question.explanation ?? null,
      ...(question.audioClips?.length && {
        audioClips: question.audioClips.map((clip, clipIndex) => ({
          id: `${question.questionKey ?? `q${index + 1}`}-clip-${clipIndex + 1}`,
          label: clip.label ?? null,
          url: clip.file?.url ?? null,
        })),
      }),
    }),
  );

  return {
    id: assessment.assessmentKey ?? `${chapterSlug}-assessment`,
    title: assessment.title ?? 'Knowledge Check',
    questions,
  };
}

function mapInteractive(
  interactive: StrapiInteractiveActivity | null | undefined,
  chapterSlug: string,
): CourseInteractive | undefined {
  if (!interactive) return undefined;
  return {
    id: interactive.activityKey ?? `${chapterSlug}-interactive`,
    title: interactive.title ?? '',
    kind: interactive.kind ?? '',
  };
}

/**
 * First section (in display order) that carries a model3d asset (3D scan
 * OR image — see deriveAssetType), reshaped to the chapter-level `model`
 * field studio-vr's courseData.js/CoursePage.jsx expect. The Strapi schema
 * keeps model3d on Section so each section can carry its own asset; this
 * picks a sensible default for the chapter-level field the frontend
 * currently reads, without losing the per-section data (each mapped
 * section also carries its own `model`).
 */
async function deriveTopicModel(
  sections: StrapiSection[],
  assets: AssetUrlService,
): Promise<CourseModel | undefined> {
  const withModel = sections
    .slice()
    .sort(byOrder)
    .find((section) => section.model3d?.file || section.model3d?.kind);
  return mapModel(withModel?.model3d, assets);
}

export async function mapCourseTopic(
  chapter: StrapiChapter,
  assets: AssetUrlService,
): Promise<CourseTopic> {
  const slug = chapter.slug ?? String(chapter.id ?? '');
  const ready = Boolean(chapter.ready);
  const sections = (chapter.sections ?? []).slice().sort(byOrder);

  return {
    id: slug,
    room: chapter.room ?? null,
    title: chapter.title ?? '',
    intro: chapter.intro ?? '',
    ready,
    module: chapter.mainTopic?.slug ?? null,
    moduleTitle: chapter.mainTopic?.title ?? null,
    moduleOrder: chapter.mainTopic?.order ?? null,
    number: chapter.number ?? null,
    hotspotId: chapter.hotspotId ?? null,
    ...(ready && {
      model: await deriveTopicModel(sections, assets),
      lessons: await Promise.all(
        sections.map((section) => mapLesson(section, assets)),
      ),
      assessment: mapAssessment(chapter.assessment, slug),
      interactive: mapInteractive(chapter.interactive, slug),
    }),
  };
}

export async function mapCourseTopics(
  chapters: StrapiChapter[],
  assets: AssetUrlService,
): Promise<CourseTopic[]> {
  return Promise.all(
    chapters
      .slice()
      .sort(byOrder)
      .map((chapter) => mapCourseTopic(chapter, assets)),
  );
}
