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
            'course.video-block': { populate: { video: { populate: '*' } } },
            'course.image-text-block': { populate: { images: { populate: '*' } } },
            'course.interactive-block': { populate: { activity: { populate: '*' } } },
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
