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

function mapModel(model?: StrapiModelAsset | null): CourseModel | undefined {
  if (!model) return undefined;
  return {
    kind: model.kind ?? null,
    url: model.file?.url ?? null,
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
function mapLesson(section: StrapiSection): CourseLesson {
  return {
    id: section.slug ?? String(section.id ?? ''),
    title: section.title ?? '',
    duration: section.duration ?? null,
    paragraphs: blocksToParagraphs(section.content),
    video: mapVideo(section.video),
    model: mapModel(section.model3d),
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
 * First section (in display order) that carries a 3D scan, reshaped to the
 * chapter-level `model` field studio-vr's courseData.js/CoursePage.jsx
 * expect. The Strapi schema keeps model3d on Section so each section can
 * carry its own scan; this picks a sensible default for the chapter-level
 * field the frontend currently reads, without losing the per-section data
 * (each mapped section also carries its own `model`).
 */
function deriveTopicModel(sections: StrapiSection[]): CourseModel | undefined {
  const withModel = sections
    .slice()
    .sort(byOrder)
    .find((section) => section.model3d?.file || section.model3d?.kind);
  return mapModel(withModel?.model3d);
}

export function mapCourseTopic(chapter: StrapiChapter): CourseTopic {
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
      model: deriveTopicModel(sections),
      lessons: sections.map(mapLesson),
      assessment: mapAssessment(chapter.assessment, slug),
      interactive: mapInteractive(chapter.interactive, slug),
    }),
  };
}

export function mapCourseTopics(chapters: StrapiChapter[]): CourseTopic[] {
  return chapters.slice().sort(byOrder).map(mapCourseTopic);
}
