import { validateMeld } from "./melds.js";
import { COLORS, type Tile } from "./types.js";

const COLOR_ORDER: Record<string, number> = { yellow: 0, red: 1, black: 2, blue: 3 };

function sortKey(t: Tile): number {
  if (t.kind === "wildOkey") return -1;
  return COLOR_ORDER[t.color] * 20 + t.value;
}

function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => sortKey(a) - sortKey(b));
}

interface Candidate {
  /** Tile ids; wild slots are "W0", "W1" placeholders. */
  ids: string[];
  mask: number;
  low: number;
  wilds: number;
  points: number;
}

export interface Arrangement {
  groups: string[][];
  rest: string[];
  points: number;
}

/** All valid series / sets that can be built from the hand. Real tiles are bit-indexed over `normals`. */
function buildCandidates(normals: Tile[], wilds: Tile[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const maxWilds = Math.min(wilds.length, 2);

  const push = (slots: (number | null)[], isSetLike: boolean) => {
    const wildCount = slots.filter((s) => s === null).length;
    if (wildCount > maxWilds) return;
    const realIdx = slots.filter((s): s is number => s !== null);
    if (realIdx.length === 0) return;
    let mask = 0;
    for (const i of realIdx) mask |= 1 << i;
    const key = `${isSetLike ? "s" : "r"}${mask}:${wildCount}:${slots.map((s) => (s === null ? "w" : "t")).join("")}`;
    if (seen.has(key)) return;
    seen.add(key);
    let w = 0;
    const tiles = slots.map((s) => (s === null ? wilds[w++] : normals[s]));
    const v = validateMeld(tiles, false);
    if (!v.ok) return;
    w = 0;
    const ids = slots.map((s) => (s === null ? `W${w++}` : normals[s].id));
    let low = 0;
    while (!(mask & (1 << low))) low++;
    out.push({ ids, mask, low, wilds: wildCount, points: v.meld.points });
  };

  // Series
  for (const color of COLORS) {
    const byVal = new Map<number, number[]>();
    normals.forEach((t, i) => {
      if (t.color !== color) return;
      const list = byVal.get(t.value) ?? [];
      list.push(i);
      byVal.set(t.value, list);
    });
    if (byVal.size === 0) continue;

    const windows: number[][] = [];
    for (let start = 1; start <= 13; start++) {
      for (let len = 3; start + len - 1 <= 13; len++) {
        windows.push(Array.from({ length: len }, (_, i) => start + i));
      }
    }
    for (let s = 2; s <= 12; s++) {
      const vals: number[] = [];
      for (let v = s; v <= 13; v++) vals.push(v);
      vals.push(1);
      windows.push(vals);
    }

    for (const vals of windows) {
      let missing = 0;
      for (const v of vals) if (!byVal.has(v)) missing++;
      if (missing > maxWilds || missing === vals.length) continue;
      for (const variant of [0, 1]) {
        const slots = vals.map((v) => {
          const copies = byVal.get(v);
          if (!copies) return null;
          return copies[variant] ?? copies[0];
        });
        push(slots, false);
      }
    }
  }

  // Sets
  for (let value = 1; value <= 13; value++) {
    const byColor = new Map<string, number[]>();
    normals.forEach((t, i) => {
      if (t.value !== value) return;
      const list = byColor.get(t.color) ?? [];
      list.push(i);
      byColor.set(t.color, list);
    });
    const present = COLORS.filter((c) => byColor.has(c));
    const n = present.length;
    for (let sub = 1; sub < 1 << n; sub++) {
      const chosen = present.filter((_, i) => sub & (1 << i));
      for (let w = 0; w <= maxWilds; w++) {
        const total = chosen.length + w;
        if (total < 3 || total > 4) continue;
        for (const variant of [0, 1]) {
          const slots: (number | null)[] = chosen.map((c) => {
            const copies = byColor.get(c)!;
            return copies[variant] ?? copies[0];
          });
          for (let k = 0; k < w; k++) slots.push(null);
          push(slots, true);
        }
      }
    }
  }

  return out;
}

function splitHand(hand: Tile[]): { normals: Tile[]; wilds: Tile[] } {
  const normals = sortTiles(hand.filter((t) => t.kind !== "wildOkey"));
  const wilds = hand.filter((t) => t.kind === "wildOkey");
  return { normals, wilds };
}

function faceValue(t: Tile): number {
  return t.kind === "wildOkey" ? 25 : t.value;
}

/**
 * Best partition of the hand into series/sets maximizing total points.
 * If `mustUse` is given, the partition must contain that tile (else null).
 */
export function bestSeriesArrangement(hand: Tile[], mustUse?: string): Arrangement | null {
  const { normals, wilds } = splitHand(hand);
  const cands = buildCandidates(normals, wilds);
  const n = normals.length;
  const byLow: Candidate[][] = Array.from({ length: n }, () => []);
  for (const c of cands) byLow[c.low].push(c);
  for (const list of byLow) list.sort((a, b) => b.points - a.points);

  const mustIdx = mustUse ? normals.findIndex((t) => t.id === mustUse) : -1;
  const mustIsWild = !!mustUse && wilds.some((w) => w.id === mustUse);
  if (mustUse && mustIdx < 0 && !mustIsWild) return null;

  const faces = normals.map((t) => t.value);
  let best: { picked: Candidate[]; score: number } | null = null;
  let nodes = 0;
  const BUDGET = 60000;

  const dfs = (pos: number, used: number, wildsLeft: number, points: number, rest: number, picked: Candidate[]) => {
    if (nodes++ > BUDGET) return;
    while (pos < n && used & (1 << pos)) pos++;
    if (pos >= n) {
      const wildsUsed = wilds.length - wildsLeft;
      if (mustUse) {
        if (mustIdx >= 0 && !(used & (1 << mustIdx))) return;
        if (mustIsWild && wildsUsed === 0) return;
      }
      const score = points * 1000 - rest - wildsLeft * 25;
      if (!best || score > best.score) best = { picked: [...picked], score };
      return;
    }
    for (const c of byLow[pos]) {
      if (c.mask & used) continue;
      if (c.wilds > wildsLeft) continue;
      picked.push(c);
      dfs(pos + 1, used | c.mask, wildsLeft - c.wilds, points + c.points, rest, picked);
      picked.pop();
    }
    // leave tile in the rest
    dfs(pos + 1, used, wildsLeft, points, rest + faces[pos], picked);
  };

  dfs(0, 0, wilds.length, 0, 0, []);
  const result = best as { picked: Candidate[]; score: number } | null;
  if (!result) return mustUse ? null : { groups: [], rest: sortTiles(hand).map((t) => t.id), points: 0 };

  let w = 0;
  const usedIds = new Set<string>();
  const groups: { ids: string[]; key: number }[] = [];
  for (const c of result.picked) {
    const ids = c.ids.map((id) => (/^W\d$/.test(id) ? wilds[w++].id : id));
    ids.forEach((id) => usedIds.add(id));
    groups.push({ ids, key: Math.min(...c.ids.filter((i) => !/^W\d$/.test(i)).map((i) => sortKey(normals.find((t) => t.id === i)!))) });
  }
  groups.sort((a, b) => a.key - b.key);
  const rest = sortTiles(hand.filter((t) => !usedIds.has(t.id))).map((t) => t.id);
  const points = result.picked.reduce((s, c) => s + c.points, 0);
  return { groups: groups.map((g) => g.ids), rest, points };
}

/** Pairs arrangement. `prefer` (tile id) is paired first when it would be a leftover. */
export function bestPairArrangement(hand: Tile[], prefer?: string): Arrangement {
  const wilds = hand.filter((t) => t.kind === "wildOkey");
  const normals = sortTiles(hand.filter((t) => t.kind !== "wildOkey"));
  const used = new Set<string>();
  const pairs: Tile[][] = [];

  for (let i = 0; i < normals.length; i++) {
    const a = normals[i];
    if (used.has(a.id)) continue;
    const b = normals.find((t) => t.id !== a.id && !used.has(t.id) && t.color === a.color && t.value === a.value);
    if (b) {
      used.add(a.id);
      used.add(b.id);
      pairs.push([a, b]);
    }
  }

  const singles = normals
    .filter((t) => !used.has(t.id))
    .sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : b.value - a.value));
  const freeWilds = [...wilds].sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : 0));
  while (freeWilds.length && singles.length) {
    const wild = freeWilds.shift()!;
    const single = singles.shift()!;
    used.add(wild.id);
    used.add(single.id);
    pairs.push([single, wild]);
  }
  while (freeWilds.length >= 2) {
    const a = freeWilds.shift()!;
    const b = freeWilds.shift()!;
    used.add(a.id);
    used.add(b.id);
    pairs.push([a, b]);
  }

  const valid = pairs.filter((p) => validateMeld(p, true).ok);
  const usedIds = new Set(valid.flat().map((t) => t.id));
  valid.sort((x, y) => Math.min(...x.map(sortKey).filter((k) => k >= 0), 99999) - Math.min(...y.map(sortKey).filter((k) => k >= 0), 99999));
  return {
    groups: valid.map((p) => p.map((t) => t.id)),
    rest: sortTiles(hand.filter((t) => !usedIds.has(t.id))).map((t) => t.id),
    points: valid.reduce((s, p) => s + (validateMeld(p, true) as { ok: true; meld: { points: number } }).meld.points, 0),
  };
}

export function arrangeHand(
  hand: Tile[],
  mode: "series" | "pairs",
): { groups: string[][]; rest: string[] } {
  if (mode === "pairs") {
    const r = bestPairArrangement(hand);
    return { groups: r.groups, rest: r.rest };
  }
  const r = bestSeriesArrangement(hand)!;
  return { groups: r.groups, rest: r.rest };
}

/** Normal opening (>=51 points) for the hand, optionally requiring `mustUse` inside it. */
export function findOpeningGroups(hand: Tile[], mustUse?: string): string[][] | null {
  const r = bestSeriesArrangement(hand, mustUse);
  return r && r.points >= 51 ? r.groups : null;
}

/** Pairs opening (>= minPairs pairs), optionally requiring `mustUse` inside it. */
export function findPairGroups(hand: Tile[], minPairs: number, mustUse?: string): string[][] | null {
  const r = bestPairArrangement(hand, mustUse);
  if (r.groups.length < minPairs) return null;
  if (mustUse && !r.groups.some((g) => g.includes(mustUse))) return null;
  return r.groups;
}

/** True if `tileId` can be part of at least one valid series/set made from the hand. */
export function canFormMeldWith(hand: Tile[], tileId: string): boolean {
  const { normals, wilds } = splitHand(hand);
  const cands = buildCandidates(normals, wilds);
  const idx = normals.findIndex((t) => t.id === tileId);
  if (idx >= 0) return cands.some((c) => c.mask & (1 << idx));
  return cands.some((c) => c.wilds > 0);
}

export { faceValue as tileFaceValue };
