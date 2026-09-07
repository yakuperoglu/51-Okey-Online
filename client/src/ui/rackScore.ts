import { validateMeld, type Tile } from "@okey/engine";
import { RACK_COLS } from "./Istaka";

export type RackScore = {
  points: number;
  groups: string[][];
  ids: Set<string>;
};

function bestMeld(tiles: Tile[]) {
  const forward = validateMeld(tiles, false);
  if (forward.ok) return forward;
  if (tiles.length >= 3) {
    const reverse = validateMeld([...tiles].reverse(), false);
    if (reverse.ok) return reverse;
  }
  return forward;
}

function scoreBlock(tiles: Tile[]): { points: number; groups: string[][] } {
  if (tiles.length < 3) return { points: 0, groups: [] };
  const whole = bestMeld(tiles);
  if (whole.ok) return { points: whole.meld.points, groups: [tiles.map((t) => t.id)] };

  let points = 0;
  const groups: string[][] = [];
  let i = 0;
  while (i < tiles.length) {
    let found = false;
    for (let len = tiles.length - i; len >= 3; len--) {
      const slice = tiles.slice(i, i + len);
      const result = bestMeld(slice);
      if (result.ok) {
        points += result.meld.points;
        groups.push(slice.map((t) => t.id));
        i += len;
        found = true;
        break;
      }
    }
    if (!found) i += 1;
  }
  return { points, groups };
}

export function scoreRack(slots: (string | null)[], tiles: Tile[]): RackScore {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  let points = 0;
  const groups: string[][] = [];
  const ids = new Set<string>();

  for (const offset of [0, RACK_COLS]) {
    const row = slots.slice(offset, offset + RACK_COLS);
    let block: Tile[] = [];
    const flush = () => {
      if (!block.length) return;
      const scored = scoreBlock(block);
      points += scored.points;
      for (const g of scored.groups) {
        groups.push(g);
        for (const id of g) ids.add(id);
      }
      block = [];
    };
    for (const id of row) {
      const tile = id ? byId.get(id) : undefined;
      if (tile) block.push(tile);
      else flush();
    }
    flush();
  }

  return { points, groups, ids };
}
