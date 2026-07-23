import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { CreateReplyDto } from './dto/create-reply.dto';
import { CreateThreadDto } from './dto/create-thread.dto';
import { DiscussionsService } from './discussions.service';

// Backs studio-vr's DiscussionPage (the "Main Bus / Talkback" board).
// Neither route is @Public()/@SkipPayment(), so — like CoursesController —
// this requires a signed-in, paid student by default (JwtAuthGuard is the
// app-wide guard; see AuthModule).
@Controller('discussions')
export class DiscussionsController {
  constructor(private readonly discussionsService: DiscussionsService) {}

  @Get()
  findByChannel(@CurrentUser() user: User, @Query('channel') channel: string) {
    return this.discussionsService.findByChannel(user, channel);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateThreadDto) {
    return this.discussionsService.create(user, dto);
  }

  @Post(':id/replies')
  reply(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReplyDto,
  ) {
    return this.discussionsService.reply(user, id, dto);
  }

  // Deletes an entire question — only reachable by the student who asked
  // it (or an instructor moderating) — see DiscussionsService.remove.
  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.discussionsService.remove(user, id);
  }

  // Deletes a single reply — only reachable by whoever posted it (or an
  // instructor) — see DiscussionsService.removeReply.
  @Delete(':id/replies/:replyId')
  removeReply(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('replyId', ParseIntPipe) replyId: number,
  ) {
    return this.discussionsService.removeReply(user, id, replyId);
  }
}
