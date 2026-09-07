import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Tile } from "@okey/engine";
import { TileView } from "./Tile";

export const RACK_COLS = 12;
export const RACK_SLOTS = 24;
const DWELL_OCCUPIED_MS = 280;
const DWELL_EMPTY_MS = 140;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scatter(ids: string[]): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: RACK_SLOTS }, () => null);
  const seats = shuffle([...Array(RACK_SLOTS).keys()]).slice(0, ids.length);
  ids.forEach((id, i) => {
    slots[seats[i]] = id;
  });
  return slots;
}

function syncSlots(prev: (string | null)[], tiles: Tile[]): (string | null)[] {
  const live = new Set(tiles.map((t) => t.id));
  const next = prev.map((id) => (id && live.has(id) ? id : null));
  const placed = new Set(next.filter(Boolean) as string[]);
  const missing = tiles.filter((t) => !placed.has(t.id)).map((t) => t.id);
  const empty = next.map((id, i) => (id ? -1 : i)).filter((i) => i >= 0);
  const spots = shuffle(empty);
  missing.forEach((id, i) => {
    if (spots[i] !== undefined) next[spots[i]] = id;
  });
  return next;
}

function moveToIndex(slots: (string | null)[], fromId: string, toIndex: number): (string | null)[] {
  const from = slots.indexOf(fromId);
  if (from < 0 || from === toIndex) return slots;
  const next = [...slots];
  const swap = next[toIndex];
  next[toIndex] = fromId;
  next[from] = swap;
  return next;
}

function slotFromPoint(x: number, y: number): number {
  const node = document.elementFromPoint(x, y)?.closest("[data-slot]");
  if (!node) return NaN;
  const to = Number(node.getAttribute("data-slot"));
  return Number.isInteger(to) && to >= 0 && to < RACK_SLOTS ? to : NaN;
}

export function Istaka({
  tiles,
  selected,
  grouped,
  scored,
  onToggle,
  dealKey,
  canDiscard,
  onDiscard,
  onHoverDiscard,
  onLayout,
}: {
  tiles: Tile[];
  selected: string[];
  grouped: Set<string>;
  scored?: Set<string>;
  onToggle: (id: string) => void;
  dealKey: string;
  canDiscard?: boolean;
  onDiscard?: (tileId: string) => void;
  onHoverDiscard?: (over: boolean) => void;
  onLayout?: (slots: (string | null)[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<(string | null)[]>(() => scatter(tiles.map((t) => t.id)));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const dwell = useRef<{ index: number; timer: number } | null>(null);
  const hoverRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const dealRef = useRef(dealKey);

  function clearDwell() {
    if (dwell.current) {
      window.clearTimeout(dwell.current.timer);
      dwell.current = null;
    }
  }

  function commitMove(id: string, to: number) {
    setSlots((prev) => moveToIndex(prev, id, to));
  }

  useEffect(() => {
    if (dealRef.current !== dealKey) {
      dealRef.current = dealKey;
      setSlots(scatter(tiles.map((t) => t.id)));
      return;
    }
    setSlots((prev) => syncSlots(prev, tiles));
  }, [tiles, dealKey]);

  useEffect(() => {
    onLayout?.(slots);
  }, [slots, onLayout]);

  useEffect(() => () => clearDwell(), []);

  const byId = new Map(tiles.map((t) => [t.id, t]));
  const dragTile = dragging ? byId.get(dragging) : undefined;
  const top = slots.slice(0, RACK_COLS);
  const bottom = slots.slice(RACK_COLS);

  function onPointerDown(event: PointerEvent<HTMLDivElement>, id: string) {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    clearDwell();
    drag.current = { id, x: event.clientX, y: event.clientY, moved: false };
    setDragging(id);
    setGhost({ x: event.clientX, y: event.clientY });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setGhost({ x: event.clientX, y: event.clientY });
    if (Math.hypot(event.clientX - d.x, event.clientY - d.y) > 6) d.moved = true;
    if (!d.moved) return;
    const overDiscard = Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-discard-drop]"));
    onHoverDiscard?.(overDiscard);
    if (overDiscard) {
      clearDwell();
      hoverRef.current = null;
      setHoverSlot(null);
      return;
    }
    const to = slotFromPoint(event.clientX, event.clientY);
    if (!Number.isFinite(to)) {
      clearDwell();
      hoverRef.current = null;
      setHoverSlot(null);
      return;
    }
    hoverRef.current = to;
    setHoverSlot(to);
    const from = slotsRef.current.indexOf(d.id);
    if (from === to) {
      clearDwell();
      return;
    }
    if (dwell.current?.index === to) return;
    clearDwell();
    const occupant = slotsRef.current[to];
    const wait = occupant && occupant !== d.id ? DWELL_OCCUPIED_MS : DWELL_EMPTY_MS;
    dwell.current = {
      index: to,
      timer: window.setTimeout(() => {
        dwell.current = null;
        commitMove(d.id, to);
      }, wait),
    };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    clearDwell();
    const overDiscard = Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-discard-drop]"));
    const dropSlot = hoverRef.current ?? slotFromPoint(event.clientX, event.clientY);
    setDragging(null);
    setGhost(null);
    setHoverSlot(null);
    hoverRef.current = null;
    onHoverDiscard?.(false);
    if (d?.moved && overDiscard && canDiscard) {
      onDiscard?.(d.id);
      return;
    }
    if (d?.moved && Number.isFinite(dropSlot)) {
      commitMove(d.id, dropSlot);
      return;
    }
    if (d && !d.moved) onToggle(d.id);
  }

  function renderRow(row: (string | null)[], offset: number) {
    return (
      <div className="istaka-rail">
        <div className="istaka-groove">
          {row.map((id, i) => {
            const index = offset + i;
            const tile = id ? byId.get(id) : undefined;
            const isDrag = Boolean(dragging && id === dragging);
            return (
              <div
                key={`slot-${index}`}
                data-slot={index}
                className={[
                  "istaka-slot",
                  tile && !isDrag ? "" : "empty",
                  isDrag ? "dragging" : "",
                  hoverSlot === index ? "drop-target" : "",
                  tile && selected.includes(tile.id) && !isDrag ? "is-selected" : "",
                  tile && scored?.has(tile.id) && !isDrag ? "in-per" : "",
                ].join(" ")}
                onPointerDown={tile && !dragging ? (e) => onPointerDown(e, tile.id) : undefined}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {tile && !isDrag ? (
                  <TileView
                    tile={tile}
                    selected={selected.includes(tile.id)}
                    dim={grouped.has(tile.id)}
                    rack
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="istaka" aria-label="Istaka" ref={rootRef}>
      <div className="istaka-wood">
        {renderRow(top, 0)}
        {renderRow(bottom, RACK_COLS)}
      </div>
      {dragTile && ghost ? (
        <div className={`tile-ghost ${drag.current?.moved ? "lifted" : "pickup"}`} style={{ left: ghost.x, top: ghost.y }}>
          <TileView tile={dragTile} rack />
        </div>
      ) : null}
    </div>
  );
}
