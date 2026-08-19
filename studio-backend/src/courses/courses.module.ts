import { Module } from '@nestjs/common';
import { StrapiModule } from '../strapi/strapi.module';
import { AssetsModule } from '../assets/assets.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [StrapiModule, AssetsModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
