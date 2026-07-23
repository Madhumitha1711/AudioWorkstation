import { Module } from '@nestjs/common';
import { StrapiModule } from '../strapi/strapi.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [StrapiModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
