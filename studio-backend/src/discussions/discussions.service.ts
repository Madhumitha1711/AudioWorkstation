import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { CreateReplyDto } from './dto/create-reply.dto';
import { CreateThreadDto } from './dto/create-thread.dto';
import { DiscussionReply } from './discussion-reply.entity';
import {
  DiscussionChannel,
  DiscussionThread,
} from './discussion-thread.entity';
import { mapThread } from './discussion.mapper';
import { DiscussionThreadResponse } from './discussion.types';

const CHANNELS: DiscussionChannel[] = ['main', 'talkback'];

@Injectable()
export class DiscussionsService {
  constructor(
    @InjectRepository(DiscussionThread)
    private readonly threads: Repository<DiscussionThread>,
    @InjectRepository(DiscussionReply)
    private readonly replies: Repository<DiscussionReply>,
  ) {}

  private isInstructor(user: User): boolean {
    return user.role === 'admin';
  }

  // 'main' is the shared board everyone in the lesson can see. 'talkback'
  // is a private line per student — a regular student only ever sees their
  // own talkback threads, while an admin (the instructor) sees every
  // student's so they can actually answer them; without this branch an
  // instructor account would only ever see talkback threads it started
  // itself.
  async findByChannel(
    user: User,
    channel: string,
  ): Promise<DiscussionThreadResponse[]> {
    if (!CHANNELS.includes(channel as DiscussionChannel)) {
      throw new BadRequestException(
        `channel must be one of: ${CHANNELS.join(', ')}`,
      );
    }

    const where: Record<string, unknown> = { channel };
    if (channel === 'talkback' && !this.isInstructor(user)) {
      where.authorId = user.id;
    }

    const found = await this.threads.find({
      where,
      relations: ['author', 'replies', 'replies.author'],
      order: { createdAt: 'DESC' },
    });

    const isInstructor = this.isInstructor(user);
    return found.map((thread) => mapThread(thread, user.id, isInstructor));
  }

  async create(
    user: User,
    dto: CreateThreadDto,
  ): Promise<DiscussionThreadResponse> {
    const thread = this.threads.create({
      channel: dto.channel,
      tag: dto.tag?.trim() || null,
      question: dto.question.trim(),
      status: 'open',
      authorId: user.id,
    });
    const saved = await this.threads.save(thread);
    saved.author = user;
    saved.replies = [];
    // The author of a brand-new thread can always delete it, regardless of
    // role — no need to check isInstructor() for the true branch here.
    return mapThread(saved, user.id, this.isInstructor(user));
  }

  async reply(
    user: User,
    threadId: number,
    dto: CreateReplyDto,
  ): Promise<DiscussionThreadResponse> {
    const thread = await this.threads.findOne({
      where: { id: threadId },
      relations: ['author', 'replies', 'replies.author'],
    });
    if (!thread) {
      throw new NotFoundException(`No discussion thread with id ${threadId}`);
    }

    // Only the thread's own author or an instructor can add to a talkback
    // line — otherwise any signed-in student could read into (and reply
    // to) another student's private conversation with the instructor just
    // by guessing an id.
    const isInstructor = this.isInstructor(user);
    if (
      thread.channel === 'talkback' &&
      thread.authorId !== user.id &&
      !isInstructor
    ) {
      throw new ForbiddenException(
        "You cannot reply to another student's private talkback thread.",
      );
    }

    const reply = this.replies.create({
      threadId: thread.id,
      authorId: user.id,
      text: dto.text.trim(),
    });
    const savedReply = await this.replies.save(reply);
    savedReply.author = user;

    // An instructor reply is what "answers" a question in the original
    // mocked seed data (see studio-vr's DiscussionPage MAIN_SEED/
    // TALKBACK_SEED — the only threads with status: 'answered' are the
    // ones with a reply from "Marcus T. / Instructor") — reproduce that
    // automatically rather than requiring a separate "mark answered"
    // action.
    if (isInstructor && thread.status !== 'answered') {
      thread.status = 'answered';
      await this.threads.save(thread);
    }

    thread.replies = [...(thread.replies ?? []), savedReply];
    return mapThread(thread, user.id, isInstructor);
  }

  // Deletes an entire question (and, via the FK's onDelete: 'CASCADE' on
  // DiscussionReply.thread, every reply under it). Restricted to the
  // thread's own author or an instructor (same moderation bypass as
  // `reply()`) — otherwise any signed-in student could wipe someone else's
  // question just by knowing its id.
  async remove(user: User, threadId: number): Promise<{ id: number }> {
    const thread = await this.threads.findOne({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException(`No discussion thread with id ${threadId}`);
    }
    if (thread.authorId !== user.id && !this.isInstructor(user)) {
      throw new ForbiddenException('You can only delete your own question.');
    }

    await this.threads.delete(threadId);
    return { id: threadId };
  }

  // Deletes a single reply and returns the thread's fresh state (so the
  // frontend can just swap the thread in place, same as `reply()`) rather
  // than a bare confirmation — the caller already has the thread's other
  // fields cached locally and only needs the updated replies array.
  // Restricted to the reply's own author or an instructor.
  async removeReply(
    user: User,
    threadId: number,
    replyId: number,
  ): Promise<DiscussionThreadResponse> {
    const reply = await this.replies.findOne({
      where: { id: replyId, threadId },
    });
    if (!reply) {
      throw new NotFoundException(
        `No reply with id ${replyId} on thread ${threadId}`,
      );
    }
    if (reply.authorId !== user.id && !this.isInstructor(user)) {
      throw new ForbiddenException('You can only delete your own reply.');
    }

    await this.replies.delete(reply.id);

    const updatedThread = await this.threads.findOne({
      where: { id: threadId },
      relations: ['author', 'replies', 'replies.author'],
    });
    if (!updatedThread) {
      throw new NotFoundException(`No discussion thread with id ${threadId}`);
    }
    return mapThread(updatedThread, user.id, this.isInstructor(user));
  }
}
