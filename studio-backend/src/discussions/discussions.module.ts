import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscussionReply } from './discussion-reply.entity';
import { DiscussionThread } from './discussion-thread.entity';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsService } from './discussions.service';

@Module({
  imports: [TypeOrmModule.forFeature([DiscussionThread, DiscussionReply])],
  controllers: [DiscussionsController],
  providers: [DiscussionsService],
})
export class DiscussionsModule {}
