import { Injectable, NotFoundException } from '@nestjs/common';
import { StrapiService } from '../strapi/strapi.service';
import { AssetUrlService } from '../assets/asset-url.service';
import { CloudflareStreamTokenService } from '../assets/cloudflare-stream-token.service';
import { mapCourseTopic, mapCourseTopics } from './course.mapper';
import {
  CourseTopic,
  StrapiChapter,
  StrapiCollectionResponse,
} from './course.types';

// Mirrors the populate query documented in
// studio-cms/STRAPI_SCHEMA_NOTES.md's "Fetching from studio-vr" section —
// pulls in everything CoursePage.jsx needs in one request. `mainTopic` is
// what makes the course sidebar's module grouping work (see
// course.mapper.ts) — without it every chapter's `module` comes back null
// and the sidebar renders empty, same failure mode as a chapter with no
// sections.
const CHAPTER_POPULATE = {
  populate: {
    mainTopic: true,
    sections: {
      populate: {
        // `blocks` is a dynamic zone (course.video-block |
        // course.image-text-block | course.interactive-block |
        // course.custom-embed-block — see studio-cms's
        // STRAPI_SCHEMA_NOTES.md), so each component type's own nested
        // fields have to be populated explicitly via Strapi 5's
        // polymorphic `on` populate rather than a single flat `populate:
        // '*'` (that only shallow-populates each block's own scalar
        // fields, not a video-block's nested `video` component or an
        // image-text-block's `images` media).
        blocks: {
          on: {
            // `layout` (course.block-layout — pairWithNext/columnWidths/
            // verticalAlign, see STRAPI_SCHEMA_NOTES.md's "Side-by-side
            // block layout") has to be listed explicitly here too, same as
            // `video`/`images`/`activity` below: this object form of `on`
            // populate only returns exactly the nested fields named in it,
            // so any component field left out — `layout` included — comes
            // back missing from Strapi's response no matter what's set (and
            // published) on it in the admin. `course.custom-embed-block`
            // doesn't need its own entry since its `populate: '*'` already
            // covers every one of its first-level fields, `layout` included.
            'course.video-block': {
              populate: { video: { populate: '*' }, layout: true },
            },
            'course.image-text-block': {
              populate: { images: { populate: '*' }, layout: true },
            },
            'course.interactive-block': {
              populate: { activity: { populate: '*' }, layout: true },
            },
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
  },
  sort: ['order:asc'],
  // Strapi's REST API defaults to 25 results per collection query
  // (studio-cms's config/api.ts sets api.rest.defaultLimit = 25) when no
  // `pagination` is specified. The full syllabus is 25 numbered chapters
  // plus the bonus "Low Frequency Emitter" chapter = 26 total, one past
  // that default — so without this, whichever chapter sorts last
  // silently never comes back, and *which* chapter that is can shift
  // any time content is edited/republished (ties in `order` fall back to
  // Strapi's internal row order). 100 matches api.rest.maxLimit in
  // studio-cms's config/api.ts, well above the current chapter count.
  pagination: { pageSize: 100 },
};

@Injectable()
export class CoursesService {
  constructor(
    private readonly strapi: StrapiService,
    private readonly assets: AssetUrlService,
    private readonly streamTokens: CloudflareStreamTokenService,
  ) {}

  /** Every chapter (Speakers, Mixing Console, DAW Workstation, ...), in curriculum order. */
  async findAll(): Promise<CourseTopic[]> {
    const response = await this.strapi.get<
      StrapiCollectionResponse<StrapiChapter>
    >('/api/chapters', CHAPTER_POPULATE);
    return mapCourseTopics(response.data, this.assets, this.streamTokens);
  }

  /** A single chapter by its slug (studio-vr's `TOPICS[].id`, e.g. "speaker"). */
  async findBySlug(slug: string): Promise<CourseTopic> {
    const response = await this.strapi.get<
      StrapiCollectionResponse<StrapiChapter>
    >('/api/chapters', {
      ...CHAPTER_POPULATE,
      filters: { slug: { $eq: slug } },
    });

    const [chapter] = response.data;
    if (!chapter) {
      throw new NotFoundException(`No course topic found for slug "${slug}"`);
    }
    return mapCourseTopic(chapter, this.assets, this.streamTokens);
  }
}
