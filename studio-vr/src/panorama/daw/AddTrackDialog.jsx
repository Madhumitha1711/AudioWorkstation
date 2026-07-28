import { TRACK_COLORS } from "./constants";
import { TrackIcon, TRACK_ICON_KEYS } from "./icons";

// "New Track" dialog — Logic-style: pick a name, color and source icon
// before the track is created (see openAddTrackDialog/confirmAddTrack in
// DawWorkstationScreen.jsx). Upload/demo still happen from the track row
// afterwards, same as they always did. Purely presentational/controlled —
// `draft`/`setDraft` own the in-progress values, `nextTrackNumber` is only
// needed to pick a sensible default name when the Audio/Aux toggle flips.
export function AddTrackDialog({ open, onClose, draft, setDraft, nextTrackNumber, onConfirm }) {
  if (!open) return null;
  return (
    <div className="daw-modal-overlay" onClick={onClose}>
      <div className="daw-modal new-track-modal" onClick={(e) => e.stopPropagation()}>
        <div className="daw-modal__head">
          <div className="daw-modal__title">New Track</div>
          <button className="plugin-popup__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="daw-modal__body">
          <div className="daw-field">
            <span className="daw-field__label mono">TYPE</span>
            <div className="type-toggle" role="radiogroup" aria-label="Track type">
              <button
                type="button"
                role="radio"
                aria-checked={draft.kind !== "aux"}
                className={"type-toggle__btn" + (draft.kind !== "aux" ? " is-selected" : "")}
                onClick={() => {
                  const n = nextTrackNumber;
                  setDraft((d) => ({
                    ...d,
                    kind: "audio",
                    name: d.name === `Aux ${n}` ? `Track ${n}` : d.name,
                    icon: d.icon === "aux" ? "audio" : d.icon,
                  }));
                }}
              >
                Audio Track
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.kind === "aux"}
                className={"type-toggle__btn" + (draft.kind === "aux" ? " is-selected" : "")}
                title="A bus with no audio of its own — tracks route to it via Sends, and its own inserts (e.g. a shared Reverb) process everything sent to it before it reaches the mix"
                onClick={() => {
                  const n = nextTrackNumber;
                  setDraft((d) => ({
                    ...d,
                    kind: "aux",
                    name: d.name === `Track ${n}` ? `Aux ${n}` : d.name,
                    icon: "aux",
                  }));
                }}
              >
                Aux Bus
              </button>
            </div>
          </div>

          <label className="daw-field">
            <span className="daw-field__label mono">NAME</span>
            <input
              type="text"
              className="daw-field__input"
              value={draft.name}
              autoFocus
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirm();
              }}
            />
          </label>

          <div className="daw-field">
            <span className="daw-field__label mono">COLOR</span>
            <div className="swatch-grid">
              {TRACK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"swatch-btn" + (draft.color === c ? " is-selected" : "")}
                  style={{ "--sw": `var(--${c})` }}
                  title={c}
                  aria-label={c}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                />
              ))}
            </div>
          </div>

          {draft.kind !== "aux" && (
            <div className="daw-field">
              <span className="daw-field__label mono">ICON</span>
              <div className="icon-grid">
                {TRACK_ICON_KEYS.filter((k) => k !== "aux").map((ikey) => (
                  <button
                    key={ikey}
                    type="button"
                    className={"icon-btn" + (draft.icon === ikey ? " is-selected" : "")}
                    style={{ "--sw": `var(--${draft.color})` }}
                    title={ikey}
                    aria-label={ikey}
                    onClick={() => setDraft((d) => ({ ...d, icon: ikey }))}
                  >
                    <TrackIcon ikey={ikey} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="daw-modal__foot">
          <button className="daw-btn small" onClick={onClose}>
            Cancel
          </button>
          <button className="daw-btn small primary" onClick={onConfirm}>
            Create Track
          </button>
        </div>
      </div>
    </div>
  );
}
