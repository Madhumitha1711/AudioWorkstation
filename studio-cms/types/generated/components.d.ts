import type { Schema, Struct } from '@strapi/strapi';

export interface CourseAnswerOption extends Struct.ComponentSchema {
  collectionName: 'components_course_answer_options';
  info: {
    displayName: 'Answer Option';
    icon: 'check-square';
  };
  attributes: {
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface CourseAssessment extends Struct.ComponentSchema {
  collectionName: 'components_course_assessments';
  info: {
    description: "Knowledge-check quiz for a topic, matching TOPICS[].assessment in studio-vr's courseData.js. Individual questions can carry their own audioClips (see course.question) for ear-training-style questions.";
    displayName: 'Assessment';
    icon: 'clipboard-check';
  };
  attributes: {
    assessmentKey: Schema.Attribute.String;
    questions: Schema.Attribute.Component<'course.question', true>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface CourseBlockLayout extends Struct.ComponentSchema {
  collectionName: 'components_course_block_layouts';
  info: {
    description: "Optional side-by-side placement for a block within a Section's Blocks zone (see api::section.section's `blocks` dynamic zone). Every block in that zone stacks top-to-bottom by default; turning on `pairWithNext` on a block pairs it with the very next block in the list into one two-column row instead (e.g. an image-text block on the left, an interactive block on the right). Nested as a `layout` field on each of the four block types (course.video-block, course.image-text-block, course.interactive-block, course.custom-embed-block) rather than living on the zone itself, since a dynamic zone has no field of its own shared across every entry in it \u2014 see STRAPI_SCHEMA_NOTES.md's \"Side-by-side block layout\" section.";
    displayName: 'Block Layout';
    icon: 'columns';
  };
  attributes: {
    columnWidths: Schema.Attribute.Enumeration<
      ['even', 'this-wide', 'this-narrow']
    > &
      Schema.Attribute.DefaultTo<'even'>;
    pairWithNext: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    verticalAlign: Schema.Attribute.Enumeration<['top', 'center', 'stretch']> &
      Schema.Attribute.DefaultTo<'top'>;
  };
}

export interface CourseCustomEmbedBlock extends Struct.ComponentSchema {
  collectionName: 'components_course_custom_embed_blocks';
  info: {
    description: "Generic placeholder block for a position within a Section's Blocks zone, for embedding a frontend component that doesn't exist yet (or is too app-specific to warrant its own CMS schema). Editors set a componentKey + freeform config now; studio-vr looks componentKey up in src/course/customEmbedRegistry.js and renders whatever's registered there, so new embed types ship as a frontend-only change \u2014 no CMS migration needed.";
    displayName: 'Custom Embed Block';
    icon: 'plug';
  };
  attributes: {
    componentKey: Schema.Attribute.String & Schema.Attribute.Required;
    config: Schema.Attribute.JSON;
    enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    layout: Schema.Attribute.Component<'course.block-layout', false>;
    title: Schema.Attribute.String;
  };
}

export interface CourseImageTextBlock extends Struct.ComponentSchema {
  collectionName: 'components_course_image_text_blocks';
  info: {
    description: "Rich-text content, optionally paired with one or more images, for a position within a Section's Blocks zone. Replaces the old fixed `content` field on Section \u2014 a section can now carry several of these, interleaved with video/interactive/embed blocks in whatever order editors arrange them.";
    displayName: 'Image + Text Block';
    icon: 'picture';
  };
  attributes: {
    content: Schema.Attribute.Blocks & Schema.Attribute.Required;
    heading: Schema.Attribute.String;
    imagePosition: Schema.Attribute.Enumeration<
      ['left', 'right', 'top', 'text-only']
    > &
      Schema.Attribute.DefaultTo<'right'>;
    images: Schema.Attribute.Media<'images', true>;
    layout: Schema.Attribute.Component<'course.block-layout', false>;
  };
}

export interface CourseInteractiveActivity extends Struct.ComponentSchema {
  collectionName: 'components_course_interactive_activities';
  info: {
    description: "Hands-on lab step for a topic, matching TOPICS[].interactive in studio-vr's courseData.js (e.g. speaker-lab, equalizer-lab).";
    displayName: 'Interactive Activity';
    icon: 'puzzle-piece';
  };
  attributes: {
    activityKey: Schema.Attribute.String;
    kind: Schema.Attribute.String & Schema.Attribute.Required;
    title: Schema.Attribute.String;
  };
}

export interface CourseInteractiveBlock extends Struct.ComponentSchema {
  collectionName: 'components_course_interactive_blocks';
  info: {
    description: "Wraps a course.interactive-activity for placement inside a Section's Blocks zone, with an `enabled` toggle so editors can position an interactive activity in the section's content while keeping it turned off (e.g. still being built, or temporarily pulled) without removing it or losing its place in the ordering.";
    displayName: 'Interactive Block';
    icon: 'puzzle-piece';
  };
  attributes: {
    activity: Schema.Attribute.Component<'course.interactive-activity', false> &
      Schema.Attribute.Required;
    enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    layout: Schema.Attribute.Component<'course.block-layout', false>;
  };
}

export interface CourseQuestion extends Struct.ComponentSchema {
  collectionName: 'components_course_questions';
  info: {
    displayName: 'Assessment Question';
    icon: 'question';
  };
  attributes: {
    audioClips: Schema.Attribute.Component<'shared.audio-asset', true>;
    correctIndex: Schema.Attribute.Integer & Schema.Attribute.Required;
    explanation: Schema.Attribute.Text;
    options: Schema.Attribute.Component<'course.answer-option', true> &
      Schema.Attribute.Required;
    prompt: Schema.Attribute.Text & Schema.Attribute.Required;
    questionKey: Schema.Attribute.String;
  };
}

export interface CourseVideoBlock extends Struct.ComponentSchema {
  collectionName: 'components_course_video_blocks';
  info: {
    description: "Lesson video for a position within a Section's Blocks zone (see api::section.section's `blocks` dynamic zone). Wraps shared.cloudflare-video so a section can carry more than one video, each independently placed alongside other block types (image+text, interactive, custom embed).";
    displayName: 'Video Block';
    icon: 'play-circle';
  };
  attributes: {
    caption: Schema.Attribute.String;
    layout: Schema.Attribute.Component<'course.block-layout', false>;
    title: Schema.Attribute.String;
    video: Schema.Attribute.Component<'shared.cloudflare-video', false> &
      Schema.Attribute.Required;
  };
}

export interface SharedAudioAsset extends Struct.ComponentSchema {
  collectionName: 'components_shared_audio_assets';
  info: {
    description: 'A short reference audio clip (e.g. a before/after ear-training example) that can be attached to an assessment question.';
    displayName: 'Audio Asset';
    icon: 'volume-up';
  };
  attributes: {
    file: Schema.Attribute.Media<'audios'> & Schema.Attribute.Required;
    label: Schema.Attribute.String;
  };
}

export interface SharedCloudflareVideo extends Struct.ComponentSchema {
  collectionName: 'components_shared_cloudflare_videos';
  info: {
    description: 'Reference to a video hosted on Cloudflare Stream. Strapi does not store the video file itself \u2014 use the upload button on this field in the admin (pushes to Cloudflare Stream via POST /api/sections/:id/video), or paste a UID by hand if you uploaded to Cloudflare yourself.';
    displayName: 'Cloudflare Video';
    icon: 'play-circle';
  };
  attributes: {
    captionsUrl: Schema.Attribute.String;
    durationSeconds: Schema.Attribute.Integer;
    status: Schema.Attribute.Enumeration<
      ['pending', 'processing', 'ready', 'error']
    > &
      Schema.Attribute.DefaultTo<'pending'>;
    thumbnail: Schema.Attribute.Media<'images'>;
    videoUid: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.CustomField<'global::video-upload'>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'course.answer-option': CourseAnswerOption;
      'course.assessment': CourseAssessment;
      'course.block-layout': CourseBlockLayout;
      'course.custom-embed-block': CourseCustomEmbedBlock;
      'course.image-text-block': CourseImageTextBlock;
      'course.interactive-activity': CourseInteractiveActivity;
      'course.interactive-block': CourseInteractiveBlock;
      'course.question': CourseQuestion;
      'course.video-block': CourseVideoBlock;
      'shared.audio-asset': SharedAudioAsset;
      'shared.cloudflare-video': SharedCloudflareVideo;
    }
  }
}
