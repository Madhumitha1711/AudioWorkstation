/**
 * Custom routes bolted onto the core section router (routes/section.ts).
 * Strapi loads every file in an api's routes/ folder and merges them, so
 * this lives alongside the auto-generated CRUD routes rather than replacing
 * them.
 *
 * Both routes are plain content-API routes — same auth model as the rest of
 * this project (no users-permissions plugin; callers authenticate with a
 * Strapi API token as `Authorization: Bearer <token>`, per
 * STRAPI_SCHEMA_NOTES.md). If the token is a "custom" type rather than
 * "full access", remember to explicitly grant it these two actions
 * (Settings -> API Tokens) since they aren't part of the default CRUD set.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/sections/:id/video',
      handler: 'section.uploadVideo',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/sections/:id/video/status',
      handler: 'section.refreshVideoStatus',
      config: {
        policies: [],
      },
    },
  ],
};
