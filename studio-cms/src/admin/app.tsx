import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: [
      // 'ar',
      // 'fr',
      // 'cs',
      // 'de',
      // 'da',
      // 'es',
      // 'he',
      // 'id',
      // 'it',
      // 'ja',
      // 'ko',
      // 'ms',
      // 'nl',
      // 'no',
      // 'pl',
      // 'pt-BR',
      // 'pt',
      // 'ru',
      // 'sk',
      // 'sv',
      // 'th',
      // 'tr',
      // 'uk',
      // 'vi',
      // 'zh-Hans',
      // 'zh',
    ],
  },
  register(app: StrapiApp) {
    // Admin-side half of the "video-upload" custom field. Used by the
    // Lesson content type's shared.cloudflare-video component (see
    // src/components/shared/cloudflare-video.json's `videoUid` attribute,
    // which points at "global::video-upload"). Replaces the default text
    // input for that field with an upload widget that pushes a file
    // straight to Cloudflare Stream via the existing
    // POST /api/lessons/:id/video route.
    //
    // Registered directly here (no plugin) since this is app-specific and
    // isn't meant for Marketplace distribution. Matching server-side
    // registration: src/index.ts. Widget implementation:
    // src/admin/extensions/video-upload/Input.tsx.
    app.customFields.register({
      name: 'video-upload',
      type: 'string',
      intlLabel: {
        id: 'studio-cms.video-upload.label',
        defaultMessage: 'Video',
      },
      intlDescription: {
        id: 'studio-cms.video-upload.description',
        defaultMessage: 'Upload a video file directly to Cloudflare Stream.',
      },
      components: {
        Input: async () => import('./extensions/video-upload/Input'),
      },
    });
  },
  bootstrap(_app: StrapiApp) {},
};
