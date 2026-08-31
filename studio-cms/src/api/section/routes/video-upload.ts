/**
 * Custom routes bolted onto the core section router (routes/section.ts).
 * Strapi loads every file in an api's routes/ folder and merges them, so
 * this lives alongside the auto-generated CRUD routes rather than replacing
 * them.
 *
 * `:blockIndex` is the zero-based position of a `course.video-block` entry
 * within the section's `blocks` dynamic zone (see
 * ../controllers/section.ts's findVideoBlock for why the video lives there
 * now instead of a single top-level field).
 *
 * Both routes are plain content-API routes — same auth model as the rest of
 * this project (no users-permissions plugin; callers authenticate with a
 * Strapi API token as `Authorization: Bearer <token>`, per
 * STRAPI_SCHEMA_NOTES.md). If the token is a "custom" type rather than
 * "full access", remember to explicitly grant it these two actions
 * (Settings -> API Tokens) since they aren't part of the default CRUD set.
 *
 * These are for server-to-server callers only (the NestJS backend,
 * curl/Postman). The admin panel's own "Upload video" widget
 * (src/admin/extensions/video-upload/Input.tsx) does NOT call these — it
 * hits a separate `type: 'admin'` mirror of these same two routes,
 * registered in src/index.ts's register() hook and authenticated via the
 * logged-in editor's admin session instead of an API token. See the
 * comment there for why: an admin-panel request carries the admin JWT, and
 * these content-API routes don't accept that as a credential (you'd get
 * "Missing or invalid credentials" if the widget called here instead).
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/sections/:id/video/:blockIndex',
      handler: 'section.uploadVideo',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/sections/:id/video/:blockIndex/status',
      handler: 'section.refreshVideoStatus',
      config: {
        policies: [],
      },
    },
  ],
};
