import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateThreadDto {
  @IsIn(['main', 'talkback'])
  channel: 'main' | 'talkback';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question: string;

  // Not sent by studio-vr's current composer (see the comment on
  // DiscussionThread.tag) — optional so the DTO doesn't need to change once
  // a per-station discussion view starts passing one.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tag?: string;
}
