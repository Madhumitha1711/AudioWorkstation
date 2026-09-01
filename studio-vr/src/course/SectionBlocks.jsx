import VideoPlayer from "./VideoPlayer";
import InteractiveSection from "./InteractiveSection";
import { CUSTOM_EMBEDS } from "./customEmbedRegistry";
import "./SectionBlocks.css";

/**
 * Renders one "leaf" block — everything a Section's `blocks` zone can
 * actually hold in studio-cms (video / image-text / interactive / embed;
 * see studio-cms's `course.*-block` components and studio-backend's
 * course.mapper.ts `mapLeafBlock`). Used both for a block rendered
 * full-width directly in `blocks`, and for each column of a "row" block
 * (see SectionBlocks below) — a row's columns are always two of these,
 * never another row.
 */
function renderLeafBlock(block, { fallbackDuration, sectionTitle, onInteractiveComplete }) {
  switch (block.type) {
    case "video":
      return (
        <div className="section-block section-block-video" key={block.id}>
          {block.title && <h3 className="block-heading">{block.title}</h3>}
          <VideoPlayer
            video={block.video}
            fallbackDuration={fallbackDuration}
            title={block.title ?? sectionTitle}
          />
          <p className="video-caption">{block.caption || "Watch first, then read on below."}</p>
        </div>
      );

    case "image-text": {
      const showImages = block.imagePosition !== "text-only" && block.images?.length > 0;
      return (
        <div
          className={`section-block section-block-image-text pos-${block.imagePosition}`}
          key={block.id}
        >
          {block.heading && <h3 className="block-heading">{block.heading}</h3>}
          <div className="image-text-row">
            {showImages && (
              <div className="image-text-media">
                {block.images.map(
                  (img, i) =>
                    img.url && <img key={i} src={img.url} alt={img.alt || ""} loading="lazy" />
                )}
              </div>
            )}
            <div className="lesson-article image-text-copy">
              {block.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "interactive":
      return (
        <div className="section-block section-block-interactive" key={block.id}>
          {block.enabled && block.interactive ? (
            <InteractiveSection
              interactive={block.interactive}
              onComplete={onInteractiveComplete}
              variant="embedded"
            />
          ) : (
            <div className="block-disabled-note">
              <span className="block-disabled-tag">Disabled</span>
              {block.interactive?.title ?? "This interactive activity"} is currently turned off
              for this section.
            </div>
          )}
        </div>
      );

    case "embed": {
      if (!block.enabled) {
        return (
          <div className="section-block section-block-embed" key={block.id}>
            <div className="block-disabled-note">
              <span className="block-disabled-tag">Disabled</span>
              {block.title ?? block.componentKey} is currently turned off for this section.
            </div>
          </div>
        );
      }

      const Embed = CUSTOM_EMBEDS[block.componentKey];
      return (
        <div className="section-block section-block-embed" key={block.id}>
          {Embed ? (
            <Embed title={block.title} config={block.config} />
          ) : (
            <div className="block-embed-placeholder">
              <div className="block-embed-placeholder-tag">Custom component</div>
              <p>
                {block.title ? <strong>{block.title}</strong> : null}
                {block.title ? " — " : ""}“{block.componentKey}” is configured here but not built
                into studio-vr yet. Register it in <code>src/course/customEmbedRegistry.js</code>{" "}
                to render it in this spot.
              </p>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Renders a Section's ordered `blocks` array — the CMS-configurable mix of
 * lesson video, image + text, interactive activity, and custom-embed
 * content that replaces the old fixed `video`/`paragraphs` fields on a
 * lesson (see studio-cms's `course.*-block` components and
 * studio-backend's course.mapper.ts `mapLeafBlock`/`groupBlocksIntoRows`,
 * and STRAPI_SCHEMA_NOTES.md's "Section `blocks` dynamic zone" section).
 *
 * Order in `blocks` IS the display order — it mirrors however editors
 * arranged the dynamic zone in the Strapi admin (drag to reorder there),
 * so this renders the array as-is with no client-side sorting. A "row"
 * entry is the one exception to "one entry = one block": studio-backend
 * already folded two consecutive editor-authored blocks into it (see
 * groupBlocksIntoRows) whenever the first had its `layout.pairWithNext`
 * turned on in the CMS — see STRAPI_SCHEMA_NOTES.md's "Side-by-side block
 * layout" for why that grouping happens server-side rather than as its own
 * CMS block type. This just lays its `columns` out as a flex row instead
 * of rendering one full-width block.
 */
function SectionBlocks({ blocks, fallbackDuration, sectionTitle, onInteractiveComplete }) {
  if (!blocks?.length) return null;

  const leafProps = { fallbackDuration, sectionTitle, onInteractiveComplete };

  return (
    <div className="section-blocks">
      {blocks.map((block) => {
        if (block.type !== "row") return renderLeafBlock(block, leafProps);

        return (
          <div
            className={`section-block-row widths-${block.columnWidths} align-${block.verticalAlign}`}
            key={block.id}
          >
            {block.columns.map((column) => renderLeafBlock(column, leafProps))}
          </div>
        );
      })}
    </div>
  );
}

export default SectionBlocks;
