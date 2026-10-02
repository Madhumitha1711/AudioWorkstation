import { useState } from "react";
import ListenTabs, { ClipPlayer } from "../../shared/ListenTabs";

export function SetupBar({ keptSame }) {
  return (
    <div className="acl-setup">
      <b>Kept the same every time:</b> {keptSame}
    </div>
  );
}

export function RoomTabs({ items, audio, compareFor, ariaLabel, idPrefix }) {
  const [active, setActive] = useState(items[0].id);

  function onChange(id) {
    if (audio.playing) audio.stop();
    setActive(id);
  }

  return (
    <ListenTabs
      items={items}
      value={active}
      onChange={onChange}
      ariaLabel={ariaLabel}
      idPrefix={idPrefix}
      renderListen={(item) => {
        const compare = compareFor(item);
        return (
          <>
            <div className="ltb-listen-label">Listen</div>
            <p className="ltb-listen-hint">
              {compare
                ? `Play it, then press A/B to flip to the ${compare.label.toLowerCase()} at the same spot.`
                : "Start here. The other tabs are compared against this one."}
            </p>
            <ClipPlayer id={item.id} label={item.title} audio={audio} compare={compare} />
          </>
        );
      }}
      renderBody={(item) => <p>{item.body}</p>}
    />
  );
}
