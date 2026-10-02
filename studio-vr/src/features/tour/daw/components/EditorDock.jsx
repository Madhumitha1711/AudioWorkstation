import { fmtTime } from "../lib/format";
import { useRef } from "react";
import { Tabs, useTabTransition } from "../../../../components/Tabs";
import { InsertRack } from "./InsertRack";

const DOCK_SCOPE_TABS = [
  {
    id: "track",
    label: "Outer (this portion)",
    title:
      "Starts out showing the track's own chain, applied here same as everywhere else — edit, reorder, bypass, or remove a plugin to fork a private copy for only this portion, or leave it alone to keep following the track chain",
  },
  {
    id: "portion",
    label: "This portion",
    title: "Edit this portion's own chain — runs after its outer chain, only within the selected range",
  },
];

export function EditorDock({
  selectedRegionObj,
  selectedRegionTrack,
  dockScope,
  setDockScope,
  dockOnPortionOuterScope,
  downloadError,
  exitSelection,
  dockTrack,
  dockChain,
  dockRegionId,
  chainActions,
}) {
  const racksRef = useRef(null);
  useTabTransition(racksRef, dockScope, DOCK_SCOPE_TABS.findIndex((t) => t.id === dockScope));
  if (!selectedRegionObj) return null;
  return (
    <div className="dock">
      <div className="dock-head">
        <div className="dock-title">
          SIGNAL CHAIN{" "}
          — <b style={{ color: `var(--${selectedRegionTrack.color})` }}>{selectedRegionTrack.name.toUpperCase()}</b>{" "}
          <span className="mono">
            [{fmtTime(selectedRegionObj.start)}–{fmtTime(selectedRegionObj.end)}]
          </span>
          {dockOnPortionOuterScope &&
            (selectedRegionObj.outerCustomized ? " · outer (this portion only)" : " · outer (inherited from track — not yet customized)")}
        </div>
        <Tabs
          className="dock-scope-tabs"
          variant="segmented"
          size="sm"
          items={DOCK_SCOPE_TABS}
          value={dockScope}
          onChange={setDockScope}
          ariaLabel="Chain scope"
          idPrefix="dock-scope"
        />
        <div className="dock-head-right">
          <div className="dock-hint">
            {downloadError ? (
              <span className="daw-error">{downloadError}</span>
            ) : dockOnPortionOuterScope ? (
              selectedRegionObj.outerCustomized ? (
                "A pre-chain private to this portion — runs before its own chain below, and is never heard in gaps or other portions (edit the real whole-track chain by exiting selection first)"
              ) : (
                "Currently just following the track's own chain (shown below, nothing private yet) — edit, reorder, bypass, or remove a plugin here to fork a private copy for only this portion, or leave it as-is to keep inheriting the track chain"
              )
            ) : (
              "Runs after this portion's own outer chain (see the Outer tab), only within this portion — click a plugin to add it, a chip to edit it"
            )}
          </div>
          <button className="daw-btn small" onClick={exitSelection} title="Deselect this portion — Play returns to the whole arrangement">
            ✕ Exit Selection
          </button>
        </div>
      </div>

      <div ref={racksRef} className="dock-racks">
        {dockTrack && dockChain && (
          <div className="dock-rack-col">
            <div className="dock-rack-label mono">INSERTS</div>
            <InsertRack
              chain={dockChain}
              onAddPlugin={(def) => chainActions.addOrSelectPlugin(dockTrack.id, dockRegionId, def)}
              onOpenSlot={(key) => chainActions.setActiveEditor({ trackId: dockTrack.id, regionId: dockRegionId, key })}
              onToggleBypass={(key) => chainActions.toggleBypass(dockTrack.id, dockRegionId, key)}
              onMove={(key, dir) => chainActions.movePlugin(dockTrack.id, dockRegionId, key, dir)}
              onRemove={(key) => chainActions.removePlugin(dockTrack.id, dockRegionId, key)}
              onReorder={(fromKey, toKey) => chainActions.reorderPlugin(dockTrack.id, dockRegionId, fromKey, toKey)}
              draggingKey={chainActions.draggingKey}
              setDraggingKey={chainActions.setDraggingKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}
