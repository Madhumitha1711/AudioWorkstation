import {
  CourseAnswerQuestion,
  CourseAssessment,
  CourseEmbedBlock,
  CourseImageTextBlock,
  CourseInteractive,
  CourseInteractiveBlock,
  CourseLesson,
  CourseSectionBlock,
  CourseTopic,
  CourseVideo,
  CourseVideoBlock,
  StrapiAssessment,
  StrapiBlockNode,
  StrapiChapter,
  StrapiCustomEmbedBlock,
  StrapiImageTextBlock,
  StrapiInteractiveActivity,
  StrapiInteractiveBlock,
  StrapiSection,
  StrapiSectionBlock,
  StrapiCloudflareVideo,
  StrapiVideoBlock,
} from './course.types';
import { AssetUrlService } from '../assets/asset-url.service';
import { CloudflareStreamTokenService } from '../assets/cloudflare-stream-token.service';

const byOrder = (a: { order?: number }, b: { order?: number }) =>
  (a.order ?? 0) - (b.order ?? 0);

/** Recursively pulls the plain text out of a Strapi "blocks" rich-text tree. */
function blockNodeText(node: StrapiBlockNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!node.children?.length) return '';
  return node.children.map(blockNodeText).join('');
}

/**
 * Strapi's "blocks" rich-text field (course.image-text-block's `content`,
 * née Section's own `content`) as `paragraphs: string[]`. Each top-level
 * block (normally a paragraph node) becomes one entry, matching how
 * CoursePage.jsx/SectionBlocks.jsx render `paragraphs.map((p) => <p>{p}</p>)`.
 */
function blocksToParagraphs(blocks?: StrapiBlockNode[]): string[] {
  if (!blocks?.length) return [];
  return blocks.map(blockNodeText).filter((text) => text.trim().length > 0);
}

/**
 * Reshapes a Strapi `shared.cloudflare-video` component into the
 * `CourseVideo` studio-vr reads, swapping the raw Stream `videoUid` for a
 * short-lived signed playback token along the way (see
 * CloudflareStreamTokenService) so a captured/leaked token can't be reused
 * to watch a paid course's video outside of studio-vr's own paid-and-signed-in
 * flow the way a bare, never-expiring `videoUid` could.
 *
 * `thumbnail` is a plain image stored via the same S3 upload provider as
 * a `course.image-text-block`'s `images` (see mapImageTextBlock below), so
 * it needs the same presigning — studio-vr passes `thumbnailUrl` straight
 * through as the Cloudflare Stream
 * player's `?poster=` query param (see VideoPlayer.jsx), and the browser
 * fetches that URL directly, so a raw, unsigned S3 URL just 403s there since
 * the bucket isn't public-read.
 */
async function mapVideo(
  video: StrapiCloudflareVideo | null | undefined,
  streamTokens: CloudflareStreamTokenService,
  assets: AssetUrlService,
): Promise<CourseVideo | undefined> {
  if (!video) return undefined;
  return {
    playbackToken: streamTokens.sign(video.videoUid),
    durationSeconds: video.durationSeconds ?? null,
    thumbnailUrl: await assets.presign(video.thumbnail?.url ?? null),
    captionsUrl: video.captionsUrl ?? null,
    status: video.status ?? null,
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
  fallbackId: string,
): CourseInteractive | undefined {
  if (!interactive) return undefined;
  return {
    id: interactive.activityKey ?? fallbackId,
    title: interactive.title ?? '',
    kind: interactive.kind ?? '',
  };
}

/** Stable-ish React-list-key id for a section block: prefer its own Strapi
 * component id (stable across re-fetches) and fall back to its position in
 * the zone (still stable within a single response) if the id is missing. */
function blockId(component: string, componentId: number | undefined, index: number): string {
  return componentId != null ? `${component}-${componentId}` : `${component}-${index}`;
}

async function mapVideoBlock(
  block: StrapiVideoBlock,
  index: number,
  assets: AssetUrlService,
  streamTokens: CloudflareStreamTokenService,
): Promise<CourseVideoBlock> {
  return {
    type: 'video',
    id: blockId(block.__component, block.id, index),
    title: block.title ?? null,
    caption: block.caption ?? null,
    video: await mapVideo(block.video, streamTokens, assets),
  };
}

async function mapImageTextBlock(
  block: StrapiImageTextBlock,
  index: number,
  assets: AssetUrlService,
): Promise<CourseImageTextBlock> {
  return {
    type: 'image-text',
    id: blockId(block.__component, block.id, index),
    heading: block.heading ?? null,
    paragraphs: blocksToParagraphs(block.content),
    images: await Promise.all(
      (block.images ?? []).map(async (image) => ({
        url: await assets.presign(image.url ?? null),
        alt: image.alternativeText ?? null,
      })),
    ),
    imagePosition: block.imagePosition ?? 'right',
  };
}

function mapInteractiveBlock(
  block: StrapiInteractiveBlock,
  index: number,
): CourseInteractiveBlock {
  const id = blockId(block.__component, block.id, index);
  return {
    type: 'interactive',
    id,
    // Defaults to enabled when the flag itself is missing (e.g. content
    // seeded before this field existed) rather than hiding activities that
    // were never explicitly turned off.
    enabled: block.enabled ?? true,
    interactive: mapInteractive(block.activity, id),
  };
}

function mapCustomEmbedBlock(block: StrapiCustomEmbedBlock, index: number): CourseEmbedBlock {
  return {
    type: 'embed',
    id: blockId(block.__component, block.id, index),
    componentKey: block.componentKey ?? '',
    title: block.title ?? null,
    enabled: block.enabled ?? true,
    config: block.config ?? null,
  };
}

/**
 * Dispatches a single `blocks[]` entry to its type-specific mapper by
 * `__component` — Strapi 5's discriminant field for a dynamic zone entry.
 * Array position (`index`) becomes part of each block's fallback id and is
 * otherwise left untouched: the frontend renders `blocks` in the order
 * this function is mapped over, which is exactly the order a content
 * editor arranged them in in the Strapi admin (see STRAPI_SCHEMA_NOTES.md).
 */
async function mapSectionBlock(
  block: StrapiSectionBlock,
  index: number,
  assets: AssetUrlService,
  streamTokens: CloudflareStreamTokenService,
): Promise<CourseSectionBlock> {
  switch (block.__component) {
    case 'course.video-block':
      return mapVideoBlock(block, index, assets, streamTokens);
    case 'course.image-text-block':
      return mapImageTextBlock(block, index, assets);
    case 'course.interactive-block':
      return mapInteractiveBlock(block, index);
    case 'course.custom-embed-block':
      return mapCustomEmbedBlock(block, index);
    default:
      // Exhaustiveness guard: a new component was added to the `blocks`
      // dynamic zone in Strapi without a matching case here. Surface it as
      // a disabled embed placeholder (visible in the CMS/admin as "not
      // built yet") instead of throwing and taking the whole /courses
      // response down with it.
      return {
        type: 'embed',
        id: `unknown-${index}`,
        componentKey: (block as { __component?: string }).__component ?? 'unknown',
        title: null,
        enabled: false,
        config: null,
      };
  }
}

// Output type/field name (`CourseLesson`) kept as-is even though the
// Strapi-side input is now a Section (renamed from Lesson) — see
// course.types.ts's CourseTopic.lessons comment.
async function mapLesson(
  section: StrapiSection,
  assets: AssetUrlService,
  streamTokens: CloudflareStreamTokenService,
): Promise<CourseLesson> {
  const blocks = section.blocks ?? [];
  return {
    id: section.slug ?? String(section.id ?? ''),
    title: section.title ?? '',
    duration: section.duration ?? null,
    blocks: await Promise.all(
      blocks.map((block, index) => mapSectionBlock(block, index, assets, streamTokens)),
    ),
  };
}

export async function mapCourseTopic(
  chapter: StrapiChapter,
  assets: AssetUrlService,
  streamTokens: CloudflareStreamTokenService,
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
      lessons: await Promise.all(
        sections.map((section) => mapLesson(section, assets, streamTokens)),
      ),
      assessment: mapAssessment(chapter.assessment, slug),
      interactive: mapInteractive(chapter.interactive, `${slug}-interactive`),
    }),
  };
}

export async function mapCourseTopics(
  chapters: StrapiChapter[],
  assets: AssetUrlService,
  streamTokens: CloudflareStreamTokenService,
): Promise<CourseTopic[]> {
  return Promise.all(
    chapters
      .slice()
      .sort(byOrder)
      .map((chapter) => mapCourseTopic(chapter, assets, streamTokens)),
  );
}
