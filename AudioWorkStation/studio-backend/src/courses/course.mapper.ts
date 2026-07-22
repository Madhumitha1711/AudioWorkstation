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
  StrapiCourseTopic,
  StrapiInteractiveActivity,
  StrapiLesson,
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

function mapLesson(lesson: StrapiLesson): CourseLesson {
  return {
    id: lesson.slug ?? String(lesson.id ?? ''),
    title: lesson.title ?? '',
    duration: lesson.duration ?? null,
    paragraphs: blocksToParagraphs(lesson.content),
    video: mapVideo(lesson.video),
    model: mapModel(lesson.model3d),
  };
}

function mapAssessment(
  assessment: StrapiAssessment | null | undefined,
  topicSlug: string,
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
    id: assessment.assessmentKey ?? `${topicSlug}-assessment`,
    title: assessment.title ?? 'Knowledge Check',
    questions,
  };
}

function mapInteractive(
  interactive: StrapiInteractiveActivity | null | undefined,
  topicSlug: string,
): CourseInteractive | undefined {
  if (!interactive) return undefined;
  return {
    id: interactive.activityKey ?? `${topicSlug}-interactive`,
    title: interactive.title ?? '',
    kind: interactive.kind ?? '',
  };
}

/**
 * First lesson (in display order) that carries a 3D scan, reshaped to the
 * topic-level `model` field studio-vr's courseData.js/CoursePage.jsx expect.
 * The Strapi schema moved model3d onto Lesson so each lesson can carry its
 * own scan; this picks a sensible default for the topic-level field the
 * frontend currently reads, without losing the per-lesson data (each mapped
 * lesson also carries its own `model`).
 */
function deriveTopicModel(lessons: StrapiLesson[]): CourseModel | undefined {
  const withModel = lessons
    .slice()
    .sort(byOrder)
    .find((lesson) => lesson.model3d?.file || lesson.model3d?.kind);
  return mapModel(withModel?.model3d);
}

export function mapCourseTopic(topic: StrapiCourseTopic): CourseTopic {
  const slug = topic.slug ?? String(topic.id ?? '');
  const ready = Boolean(topic.ready);
  const lessons = (topic.lessons ?? []).slice().sort(byOrder);

  return {
    id: slug,
    room: topic.room ?? null,
    title: topic.title ?? '',
    intro: topic.intro ?? '',
    ready,
    ...(ready && {
      model: deriveTopicModel(lessons),
      lessons: lessons.map(mapLesson),
      assessment: mapAssessment(topic.assessment, slug),
      interactive: mapInteractive(topic.interactive, slug),
    }),
  };
}

export function mapCourseTopics(topics: StrapiCourseTopic[]): CourseTopic[] {
  return topics.slice().sort(byOrder).map(mapCourseTopic);
}
