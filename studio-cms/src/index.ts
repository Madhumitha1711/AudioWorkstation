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
    // server-side half of the "video-upload" widget on the Section content
    // type's shared.cloudflare-video component: it swaps the default text
    // input for videoUid (where someone had to paste a Cloudflare Stream
    // UID by hand) for an upload button that uploads through the admin
    // route registered below.
    //
    // `type: 'string'` keeps the underlying DB column exactly as it was —
    // this only changes how the field is edited in the admin UI, so no
    // migration is needed for sections that already have a videoUid.
    //
    // Matching admin-side registration: src/admin/app.tsx.
    // Widget implementation: src/admin/extensions/video-upload/Input.tsx.
    strapi.customFields.register({
      name: 'video-upload',
      type: 'string',
    });

    // Admin-authenticated mirror of the content-API video routes
    // (src/api/section/routes/video-upload.ts).
    //
    // Why this exists: those routes are registered as plain content-API
    // routes (Strapi hardcodes `type: 'content-api'` for anything under
    // src/api/*/routes — see @strapi/core's registerAPIRoutes), so they
    // only authenticate a caller via a Strapi API token
    // (`Authorization: Bearer <api-token>`). But the "Upload video" button
    // in the admin panel (Input.tsx) calls out via @strapi/strapi/admin's
    // useFetchClient, which always attaches the *admin panel's own* session
    // JWT — a completely different auth realm that content-API routes don't
    // recognize. That mismatch is what produced "Missing or invalid
    // credentials" (ctx.unauthorized(...) from @strapi/core's auth service)
    // when uploading from the CMS UI.
    //
    // The fix is to give the admin widget its own route that's registered
    // with `type: 'admin'`, so it's checked against the admin auth
    // strategies (i.e. the logged-in editor's session) instead of an API
    // token. `strapi.server.routes()` is the documented escape hatch for
    // this — content-API and plugin routes go through registerRoutes()
    // wrappers that force their type, but a route added here goes straight
    // to the 'admin' router untouched. It reuses the exact same controller
    // actions (and therefore the exact same Cloudflare Stream upload logic
    // in src/api/section/controllers/section.ts) as the content-API routes
    // — only the auth path differs. The content-API routes stay as-is for
    // server-to-server callers (the NestJS backend, curl/Postman) per
    // STRAPI_SCHEMA_NOTES.md.
    // `as any`: strapi.controller()'s return type doesn't know about this
    // app's custom controller actions, and the route `handler` schema
    // (string | function | array) doesn't have a typed overload for
    // arbitrary async functions either — same untyped-ctx pattern the
    // controller itself already uses (see section.ts's `uploadVideo(ctx: any)`).
    const sectionController = strapi.controller('api::section.section') as any;

    (strapi.server as any).routes({
      type: 'admin',
      prefix: '/admin',
      routes: [
        {
          method: 'POST',
          path: '/section-video/:id/:blockIndex',
          handler: (ctx: any) => sectionController.uploadVideo(ctx),
          config: {
            policies: ['admin::isAuthenticatedAdmin'],
          },
        },
        {
          method: 'GET',
          path: '/section-video/:id/:blockIndex/status',
          handler: (ctx: any) => sectionController.refreshVideoStatus(ctx),
          config: {
            policies: ['admin::isAuthenticatedAdmin'],
          },
        },
      ],
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
