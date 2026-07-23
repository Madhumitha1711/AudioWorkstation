import { Injectable, NotFoundException } from '@nestjs/common';
import { StrapiService } from '../strapi/strapi.service';
import { mapCourseTopic, mapCourseTopics } from './course.mapper';
import {
  CourseTopic,
  StrapiCollectionResponse,
  StrapiCourseTopic,
} from './course.types';

// Mirrors the populate query documented in
// studio-cms/STRAPI_SCHEMA_NOTES.md's "Fetching from studio-vr" section —
// pulls in everything CoursePage.jsx needs in one request.
const COURSE_TOPIC_POPULATE = {
  populate: {
    lessons: {
      populate: {
        model3d: { populate: '*' },
        video: { populate: '*' },
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
  constructor(private readonly strapi: StrapiService) {}

  /** Every course topic (Speakers, Mixing Console, DAW Workstation, ...), in curriculum order. */
  async findAll(): Promise<CourseTopic[]> {
    const response = await this.strapi.get<
      StrapiCollectionResponse<StrapiCourseTopic>
    >('/api/course-topics', COURSE_TOPIC_POPULATE);
    return mapCourseTopics(response.data);
  }

  /** A single topic by its slug (studio-vr's `TOPICS[].id`, e.g. "speaker"). */
  async findBySlug(slug: string): Promise<CourseTopic> {
    const response = await this.strapi.get<
      StrapiCollectionResponse<StrapiCourseTopic>
    >('/api/course-topics', {
      ...COURSE_TOPIC_POPULATE,
      filters: { slug: { $eq: slug } },
    });

    const [topic] = response.data;
    if (!topic) {
      throw new NotFoundException(`No course topic found for slug "${slug}"`);
    }
    return mapCourseTopic(topic);
  }
}
