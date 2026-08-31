/**
 * Registry of custom embeddable components for a Section's "Custom Embed"
 * block (studio-cms's `course.custom-embed-block`, mapped to
 * `{ type: "embed", componentKey, title, enabled, config, ... }` by
 * studio-backend's course.mapper.ts — see STRAPI_SCHEMA_NOTES.md).
 *
 * This is the provision for embedding a frontend component that doesn't
 * exist yet: a content editor can already place a Custom Embed block in a
 * section's Blocks list (getting its placement among the other blocks
 * right away) and fill in `componentKey` + whatever `config` JSON the
 * future component will need — all before that component is built.
 *
 * To wire up a real component once it's built:
 *   1. Build it as a normal component that accepts `{ title, config }`
 *      props (`config` is whatever JSON shape the CMS's Custom Embed
 *      block was given — validate/default it defensively, since it's
 *      hand-typed JSON in the CMS admin).
 *   2. Import it here and add an entry keyed by the exact `componentKey`
 *      string an editor types into the CMS's Custom Embed block —
 *      matching the free-text `kind` pattern InteractiveSection.jsx
 *      already uses for interactive labs.
 *
 * Until an entry exists for a given key, SectionBlocks.jsx renders a
 * visible "not built yet" placeholder instead of silently dropping the
 * block, so editors can see their configuration is saved and waiting
 * rather than wondering whether the block "worked."
 *
 * Example, once a component exists:
 *   import BeforeAfterSlider from "./embeds/BeforeAfterSlider";
 *   export const CUSTOM_EMBEDS = {
 *     "before-after-slider": BeforeAfterSlider,
 *   };
 */
export const CUSTOM_EMBEDS = {};
