import { Controller, Get, Param } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CourseTopic } from './course.types';

// Read-only proxy in front of studio-cms (Strapi): studio-vr's course page
// calls this instead of talking to Strapi directly, so the Strapi API
// token never has to reach the browser. Neither route is marked @Public(),
// so both now require a signed-in student by default (JwtAuthGuard is
// applied app-wide — see AuthModule) — per-student business logic
// (progress, paid access, etc.) is still deliberately left for later.
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findAll(): Promise<CourseTopic[]> {
    return this.coursesService.findAll();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string): Promise<CourseTopic> {
    return this.coursesService.findBySlug(slug);
  }
}
