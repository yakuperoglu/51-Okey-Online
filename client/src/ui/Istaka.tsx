import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import type { OkeyIdentity, Tile } from "@okey/engine";
import { TileView } from "./Tile";

export const RACK_COLS = 13;
export const RACK_SLOTS = RACK_COLS * 2;
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

function syncSlots(prev: (string | null)[], tiles: Tile[], prefer: number | null = null): (string | null)[] {
  const live = new Set(tiles.map((t) => t.id));
  const next = prev.map((id) => (id && live.has(id) ? id : null));
  const placed = new Set(next.filter(Boolean) as string[]);
  const missing = tiles.filter((t) => !placed.has(t.id)).map((t) => t.id);
  const empty = next.map((id, i) => (id ? -1 : i)).filter((i) => i >= 0);
  const spots = shuffle(empty);
  if (prefer !== null && missing.length && spots.length) {
    // A tile drawn by drag lands on (or as near as possible to) the slot it was dropped on.
    let best = 0;
    for (let i = 1; i < spots.length; i++) if (Math.abs(spots[i] - prefer) < Math.abs(spots[best] - prefer)) best = i;
    [spots[0], spots[best]] = [spots[best], spots[0]];
  }
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

/** Forgiving drop zones: how far (px) from a pile a released tile still counts as dropped on it. */
export const DROP_RADIUS = 100;
/** Extra margin (px) around the rack inside which a dragged deck/discard tile counts as drawn. */
export const RACK_DRAW_MARGIN = 60;

function distToRect(x: number, y: number, r: DOMRect): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

/** True when the point sits on the rack itself (rearranging, never a discard). */
function overRack(x: number, y: number): boolean {
  const rack = document.querySelector(".istaka");
  if (!rack) return false;
  const r = rack.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Distance from the point to the nearest element matching the selector (Infinity if none). */
function distToSelector(x: number, y: number, selector: string): number {
  const el = document.querySelector(selector);
  return el ? distToRect(x, y, el.getBoundingClientRect()) : Infinity;
}

/** Which pile a tile released at (x, y) is aimed at: exact hit first, otherwise the nearest within DROP_RADIUS. */
export function dropTarget(x: number, y: number, canReturn: boolean): "discard" | "return" | null {
  if (overRack(x, y)) return null;
  const hit = document.elementFromPoint(x, y);
  if (canReturn && hit?.closest("[data-return-drop]")) return "return";
  if (hit?.closest("[data-discard-drop]")) return "discard";
  const dd = distToSelector(x, y, "[data-discard-drop]");
  const dr = canReturn ? distToSelector(x, y, "[data-return-drop]") : Infinity;
  if (Math.min(dd, dr) > DROP_RADIUS) return null;
  return dr < dd ? "return" : "discard";
}

/** True when a deck/discard tile dragged from (sx, sy) and released at (x, y) should count as a draw. */
export function isDrawDrop(sy: number, x: number, y: number): boolean {
  if (document.elementFromPoint(x, y)?.closest(".istaka")) return true;
  const rack = document.querySelector(".istaka");
  if (rack && distToRect(x, y, rack.getBoundingClientRect()) <= RACK_DRAW_MARGIN) return true;
  return y - sy > 60;
}

export function Istaka({
  tiles,
  selected,
  onToggle,
  dealKey,
  canDiscard,
  onDiscard,
  onHoverDiscard,
  returnTileId,
  onReturn,
  onHoverReturn,
  onLayout,
  okey,
  flipped,
  onFlip,
  placeRef,
}: {
  tiles: Tile[];
  selected: string[];
  onToggle: (id: string) => void;
  dealKey: string;
  canDiscard?: boolean;
  onDiscard?: (tileId: string) => void;
  onHoverDiscard?: (over: boolean) => void;
  /** The taken-but-unused discard may be dragged back onto the previous player's pile. */
  returnTileId?: string | null;
  onReturn?: () => void;
  onHoverReturn?: (over: boolean) => void;
  onLayout?: (slots: (string | null)[]) => void;
  /** Natural face of the okey. An unflipped okey looks like a plain tile of this face. */
  okey: OkeyIdentity;
  flipped: Set<string>;
  onFlip: (tileId: string) => void;
  /** Slot where the next newly arriving tile should land (set by dragging from the deck / discard). */
  placeRef?: MutableRefObject<number | null>;
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
  const lastTap = useRef<{ id: string; at: number } | null>(null);

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
    const prefer = placeRef?.current ?? null;
    setSlots((prev) => syncSlots(prev, tiles, prefer));
    if (placeRef && tiles.some((t) => !slotsRef.current.includes(t.id))) placeRef.current = null;
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
    const target = dropTarget(event.clientX, event.clientY, d.id === returnTileId);
    const overDiscard = target === "discard";
    const overReturn = target === "return";
    onHoverDiscard?.(overDiscard);
    onHoverReturn?.(overReturn);
    if (overDiscard || overReturn) {
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
    const target = dropTarget(event.clientX, event.clientY, d?.id === returnTileId);
    const overDiscard = target === "discard";
    const overReturn = target === "return";
    const dropSlot = hoverRef.current ?? slotFromPoint(event.clientX, event.clientY);
    setDragging(null);
    setGhost(null);
    setHoverSlot(null);
    hoverRef.current = null;
    onHoverDiscard?.(false);
    onHoverReturn?.(false);
    if (d?.moved && overReturn) {
      onReturn?.();
      return;
    }
    if (d?.moved && overDiscard && canDiscard) {
      onDiscard?.(d.id);
      return;
    }
    if (d?.moved && Number.isFinite(dropSlot)) {
      commitMove(d.id, dropSlot);
      return;
    }
    if (d && !d.moved) {
      onToggle(d.id);
      // Double click / double tap flips a real okey; identical (silent) for every other tile.
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && prev.id === d.id && now - prev.at < 380) {
        lastTap.current = null;
        if (byId.get(d.id)?.kind === "wildOkey") onFlip(d.id);
      } else {
        lastTap.current = { id: d.id, at: now };
      }
    }
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
                    rack
                    concealAs={flipped.has(tile.id) ? undefined : okey}
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
          <TileView tile={dragTile} rack concealAs={flipped.has(dragTile.id) ? undefined : okey} />
        </div>
      ) : null}
    </div>
  );
}
