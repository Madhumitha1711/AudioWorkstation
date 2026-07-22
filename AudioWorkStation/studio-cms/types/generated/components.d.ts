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
    title: Schema.Attribute.String & Schema.Attribute.Required;
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
    description: 'Reference to a video hosted on Cloudflare Stream. Strapi does not store the video file itself \u2014 use the upload button on this field in the admin (pushes to Cloudflare Stream via POST /api/lessons/:id/video), or paste a UID by hand if you uploaded to Cloudflare yourself.';
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

export interface SharedModelAsset extends Struct.ComponentSchema {
  collectionName: 'components_shared_model_assets';
  info: {
    description: "Rotatable 3D preview for a piece of gear (e.g. photogrammetry-scanned speaker.glb), matching TOPICS[].model in studio-vr's courseData.js.";
    displayName: '3D Model Asset';
    icon: 'cube';
  };
  attributes: {
    file: Schema.Attribute.Media<'files'>;
    kind: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'course.answer-option': CourseAnswerOption;
      'course.assessment': CourseAssessment;
      'course.interactive-activity': CourseInteractiveActivity;
      'course.question': CourseQuestion;
      'shared.audio-asset': SharedAudioAsset;
      'shared.cloudflare-video': SharedCloudflareVideo;
      'shared.model-asset': SharedModelAsset;
    }
  }
}
