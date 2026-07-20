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
    description: "Knowledge-check quiz for a topic, matching TOPICS[].assessment in studio-vr's courseData.js.";
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
    correctIndex: Schema.Attribute.Integer & Schema.Attribute.Required;
    explanation: Schema.Attribute.Text;
    options: Schema.Attribute.Component<'course.answer-option', true> &
      Schema.Attribute.Required;
    prompt: Schema.Attribute.Text & Schema.Attribute.Required;
    questionKey: Schema.Attribute.String;
  };
}

export interface PanoramaAmbience extends Struct.ComponentSchema {
  collectionName: 'components_panorama_ambiences';
  info: {
    description: "Synthetic ambient-bed profile for a room, matching ROOMS[].ambience consumed by spatialAudioEngine.js's startAmbientBed()/setRoomAmbience().";
    displayName: 'Room Ambience';
    icon: 'volume-up';
  };
  attributes: {
    filterFreq: Schema.Attribute.Integer & Schema.Attribute.Required;
    gain: Schema.Attribute.Decimal & Schema.Attribute.Required;
    gustDepth: Schema.Attribute.Decimal & Schema.Attribute.Required;
  };
}

export interface PanoramaInteractiveMarker extends Struct.ComponentSchema {
  collectionName: 'components_panorama_interactive_markers';
  info: {
    description: 'A live-DSP hotspot (not a read-only info panel), matching ROOMS[].interactiveMarkers[] \u2014 rendered by PanoramaTour.jsx / EqCompressorHotspot.jsx.';
    displayName: 'Interactive Marker';
    icon: 'sliders-h';
  };
  attributes: {
    markerKey: Schema.Attribute.String & Schema.Attribute.Required;
    pitch: Schema.Attribute.Float & Schema.Attribute.Required;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<['eq', 'compressor']> &
      Schema.Attribute.Required;
    yaw: Schema.Attribute.Float & Schema.Attribute.Required;
  };
}

export interface PanoramaObjective extends Struct.ComponentSchema {
  collectionName: 'components_panorama_objectives';
  info: {
    displayName: 'Learning Objective';
    icon: 'bullseye';
  };
  attributes: {
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface PanoramaRoomLink extends Struct.ComponentSchema {
  collectionName: 'components_panorama_room_links';
  info: {
    description: 'A doorway arrow from this room to another, matching ROOMS[].links[].';
    displayName: 'Room Link';
    icon: 'arrows-alt';
  };
  attributes: {
    pitch: Schema.Attribute.Float & Schema.Attribute.Required;
    targetRoomSlug: Schema.Attribute.String & Schema.Attribute.Required;
    yaw: Schema.Attribute.Float & Schema.Attribute.Required;
  };
}

export interface SharedCloudflareVideo extends Struct.ComponentSchema {
  collectionName: 'components_shared_cloudflare_videos';
  info: {
    description: 'Reference to a video hosted on Cloudflare Stream. Strapi does not store the video file itself \u2014 upload it to Cloudflare Stream first (dashboard or API) and paste the resulting UID here.';
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
    videoUid: Schema.Attribute.String & Schema.Attribute.Required;
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
      'panorama.ambience': PanoramaAmbience;
      'panorama.interactive-marker': PanoramaInteractiveMarker;
      'panorama.objective': PanoramaObjective;
      'panorama.room-link': PanoramaRoomLink;
      'shared.cloudflare-video': SharedCloudflareVideo;
      'shared.model-asset': SharedModelAsset;
    }
  }
}
