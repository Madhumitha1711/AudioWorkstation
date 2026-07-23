import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    // App-specific custom field (no plugin needed — see the "Application
    // fields" section of Strapi's Custom Fields docs). This is the
    // server-side half of the "video-upload" widget on the Lesson content
    // type's shared.cloudflare-video component: it swaps the default text
    // input for videoUid (where someone had to paste a Cloudflare Stream
    // UID by hand) for an upload button that calls the existing
    // POST /api/lessons/:id/video route directly from the admin panel.
    //
    // `type: 'string'` keeps the underlying DB column exactly as it was —
    // this only changes how the field is edited in the admin UI, so no
    // migration is needed for lessons that already have a videoUid.
    //
    // Matching admin-side registration: src/admin/app.tsx.
    // Widget implementation: src/admin/extensions/video-upload/Input.tsx.
    strapi.customFields.register({
      name: 'video-upload',
      type: 'string',
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/* { strapi }: { strapi: Core.Strapi } */) {},
};
