import VideoPlayer from "../VideoPlayer";
import InteractiveSection from "../InteractiveSection";
import { CUSTOM_EMBEDS } from "./customEmbedRegistry";
import "./SectionBlocks.css";

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
                into studio-vr yet. Register it in <code>src/features/course/components/SectionBlocks/customEmbedRegistry.js</code>{" "}
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

const LAB_FIRST_KINDS = new Set([
  "frequency-lab",
  "amplitude-lab",
  "wavelength-lab",
  "phase-lab",
  "harmonics-lab",
  "timbre-lab",
]);

function isLabFirstBlock(block) {
  return block.type === "interactive" && LAB_FIRST_KINDS.has(block.interactive?.kind);
}

function orderBlocks(blocks) {
  const out = [];
  for (const block of blocks) {
    if (isLabFirstBlock(block)) {
      let i = out.length;
      while (i > 0 && out[i - 1].type === "image-text") i--;
      out.splice(i, 0, block);
    } else {
      out.push(block);
    }
  }
  return out;
}

function SectionBlocks({ blocks, fallbackDuration, sectionTitle, onInteractiveComplete }) {
  if (!blocks?.length) return null;

  const leafProps = { fallbackDuration, sectionTitle, onInteractiveComplete };

  return (
    <div className="section-blocks">
      {orderBlocks(blocks).map((block) => {
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
