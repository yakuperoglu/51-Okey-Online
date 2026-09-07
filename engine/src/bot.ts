import { applyAction } from "./game.js";
import { validateMeld, validatePair, validateSeries, validateSet } from "./melds.js";
import { canAttach, canSwapOkey } from "./process.js";
import type { GameAction, GameState, Tile, ValidatedMeld } from "./types.js";

function ids(tiles: Tile[]): string[] {
  return tiles.map((t) => t.id);
}

function without(hand: Tile[], used: Set<string>): Tile[] {
  return hand.filter((t) => !used.has(t.id));
}

function generateSets(hand: Tile[]): ValidatedMeld[] {
  const wilds = hand.filter((t) => t.kind === "wildOkey");
  const normals = hand.filter((t) => t.kind !== "wildOkey");
  const byValue = new Map<number, Tile[]>();
  for (const t of normals) {
    const list = byValue.get(t.value) ?? [];
    list.push(t);
    byValue.set(t.value, list);
  }
  const out: ValidatedMeld[] = [];
  for (const [, group] of byValue) {
    const unique: Tile[] = [];
    const seen = new Set<string>();
    for (const t of group) {
      if (seen.has(t.color)) continue;
      seen.add(t.color);
      unique.push(t);
    }
    for (let w = 0; w <= wilds.length; w++) {
      const tiles = [...unique, ...wilds.slice(0, w)];
      if (tiles.length < 3 || tiles.length > 4) continue;
      const v = validateSet(tiles);
      if (v.ok) out.push(v.meld);
    }
  }
  return out;
}

function generateSeries(hand: Tile[]): ValidatedMeld[] {
  const wilds = hand.filter((t) => t.kind === "wildOkey");
  const colors = ["yellow", "red", "black", "blue"] as const;
  const out: ValidatedMeld[] = [];

  for (const color of colors) {
    const colored = hand.filter((t) => t.kind !== "wildOkey" && t.color === color);
    const byVal = new Map<number, Tile>();
    for (const t of colored) if (!byVal.has(t.value)) byVal.set(t.value, t);

    for (let start = 1; start <= 13; start++) {
      for (const wrap of [false, true]) {
        for (let len = 3; len <= 6; len++) {
          const picked: Tile[] = [];
          const usedWild: Tile[] = [];
          let ok = true;
          for (let i = 0; i < len; i++) {
            let v = start + i;
            if (wrap) {
              if (v === 14) v = 1;
              else if (v > 14) {
                ok = false;
                break;
              }
            } else if (v > 13) {
              ok = false;
              break;
            }
            const tile = byVal.get(v);
            if (tile && !picked.includes(tile)) picked.push(tile);
            else if (usedWild.length < wilds.length) usedWild.push(wilds[usedWild.length]);
            else {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const tiles = [...picked, ...usedWild];
          const ordered: Tile[] = [];
          const pool = [...tiles];
          for (let i = 0; i < len; i++) {
            let v = start + i;
            if (wrap && v === 14) v = 1;
            const idx = pool.findIndex((t) => t.kind !== "wildOkey" && t.value === v);
            if (idx >= 0) ordered.push(pool.splice(idx, 1)[0]);
            else {
              const w = pool.findIndex((t) => t.kind === "wildOkey");
              if (w < 0) {
                ok = false;
                break;
              }
              ordered.push(pool.splice(w, 1)[0]);
            }
          }
          if (!ok) continue;
          const v = validateSeries(ordered);
          if (v.ok) out.push(v.meld);
        }
      }
    }
  }
  return out;
}

function combinationSearch(
  candidates: ValidatedMeld[],
  accept: (picked: ValidatedMeld[]) => boolean,
): ValidatedMeld[] | null {
  candidates = [...candidates].sort((a, b) => b.points - a.points).slice(0, 28);
  let found: ValidatedMeld[] | null = null;
  let nodes = 0;

  const dfs = (i: number, used: Set<string>, picked: ValidatedMeld[]) => {
    if (found || nodes++ > 20000) return;
    if (picked.length && accept(picked)) {
      found = picked;
      return;
    }
    if (i >= candidates.length) return;
    const m = candidates[i];
    if (m.tiles.every((t) => !used.has(t.id))) {
      const next = new Set(used);
      m.tiles.forEach((t) => next.add(t.id));
      dfs(i + 1, next, [...picked, m]);
    }
    dfs(i + 1, used, picked);
  };

  dfs(0, new Set(), []);
  return found;
}

function groupsFromHand(hand: Tile[], groups: string[][], goingPairs: boolean): boolean {
  const used = new Set<string>();
  let points = 0;
  for (const group of groups) {
    const tiles: Tile[] = [];
    for (const id of group) {
      if (used.has(id)) return false;
      const tile = hand.find((t) => t.id === id);
      if (!tile) return false;
      used.add(id);
      tiles.push(tile);
    }
    const result = validateMeld(tiles, goingPairs);
    if (!result.ok) return false;
    points += result.meld.points;
  }
  return goingPairs ? groups.length >= 1 : points >= 51;
}

export function findNormalOpening(hand: Tile[]): string[][] | null {
  const found = combinationSearch([...generateSets(hand), ...generateSeries(hand)], (picked) => {
    const pts = picked.reduce((s, m) => s + m.points, 0);
    return pts >= 51;
  });
  const groups = found ? found.map((m) => ids(m.tiles)) : null;
  if (groups && groupsFromHand(hand, groups, false)) return groups;
  return null;
}

export function findPairOpening(hand: Tile[], minPairs: number): string[][] | null {
  const used = new Set<string>();
  const pairs: Tile[][] = [];
  const rest = [...hand];

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (used.has(a.id) || a.kind === "wildOkey") continue;
    const b = rest.find((t) => !used.has(t.id) && t.id !== a.id && t.kind !== "wildOkey" && t.color === a.color && t.value === a.value);
    if (b) {
      used.add(a.id);
      used.add(b.id);
      pairs.push([a, b]);
    }
  }

  const wilds = rest.filter((t) => t.kind === "wildOkey" && !used.has(t.id));
  const leftovers = rest.filter((t) => !used.has(t.id) && t.kind !== "wildOkey");
  for (const w of wilds) {
    const partner = leftovers.find((t) => !used.has(t.id));
    if (!partner) break;
    used.add(w.id);
    used.add(partner.id);
    pairs.push([w, partner]);
  }

  const leftoverWilds = rest.filter((t) => t.kind === "wildOkey" && !used.has(t.id));
  if (leftoverWilds.length >= 2) {
    pairs.push([leftoverWilds[0], leftoverWilds[1]]);
  }

  const valid = pairs.filter((p) => validatePair(p).ok);
  if (valid.length < minPairs) return null;
  return valid.slice(0, Math.max(minPairs, valid.length)).map(ids);
}

function extraMelds(state: GameState, hand: Tile[]): string[][] {
  const player = state.players[state.currentIndex];
  if (player.goingPairs) {
    const opening = findPairOpening(hand, 1);
    return opening ? opening.slice(0, 1) : [];
  }
  const found = combinationSearch([...generateSets(hand), ...generateSeries(hand)], (picked) => picked.length >= 1);
  return found ? found.slice(0, 1).map((m) => ids(m.tiles)) : [];
}

export function pickBotAction(state: GameState): GameAction | null {
  if (state.phase !== "playing") {
    return { type: "nextRound" };
  }
  const player = state.players[state.currentIndex];
  const hand = player.hand;

  if (!state.turn.hasDrawn) {
    const prev = state.players[(state.currentIndex + 3) % 4];
    const top = prev.discard[prev.discard.length - 1];
    if (top && !player.opened) {
      const trial = [...hand, top];
      const groups = findNormalOpening(trial);
      const pairs = findPairOpening(trial, state.config.minPairs);
      const chosen = groups ?? pairs;
      if (chosen && chosen.some((g) => g.includes(top.id))) {
        return { type: "drawDiscard" };
      }
    }
    return { type: "drawPile" };
  }

  if (state.turn.mustUseTileId && !player.opened) {
    const groups = findNormalOpening(hand);
    if (groups && groups.some((g) => g.includes(state.turn.mustUseTileId!))) {
      return { type: "open", groups, goingPairs: false };
    }
    const pairs = findPairOpening(hand, state.config.minPairs);
    if (pairs && pairs.some((g) => g.includes(state.turn.mustUseTileId!))) {
      return { type: "open", groups: pairs, goingPairs: true };
    }
  }

  if (!player.opened) {
    const groups = findNormalOpening(hand);
    if (groups) return { type: "open", groups, goingPairs: false };
    const pairs = findPairOpening(hand, state.config.minPairs);
    if (pairs) return { type: "open", groups: pairs, goingPairs: true };
  } else {
    const extras = extraMelds(state, hand);
    if (extras.length) {
      if (!state.turn.mustUseTileId || extras.some((g) => g.includes(state.turn.mustUseTileId!))) {
        return { type: "open", groups: extras, goingPairs: player.goingPairs };
      }
    }

    if (!player.goingPairs) {
      for (const tile of hand) {
        if (state.turn.mustUseTileId && tile.id !== state.turn.mustUseTileId) continue;
        for (const meld of state.tableMelds) {
          if (canSwapOkey(meld, tile)) {
            return { type: "process", tileId: tile.id, meldId: meld.id, place: "swapOkey" };
          }
          const places = canAttach(meld, tile);
          if (places[0]) {
            return { type: "process", tileId: tile.id, meldId: meld.id, place: places[0] };
          }
        }
      }
    }
  }

  const required = state.turn.mustUseTileId;
  if (required) return null;

  const discardable = hand.filter((t) => t.kind !== "wildOkey");
  const pool = discardable.length ? discardable : hand;
  const pick = [...pool].sort((a, b) => b.value - a.value)[0];
  return pick ? { type: "discard", tileId: pick.id } : null;
}

export function runBotTurn(state: GameState, maxSteps = 12): GameState {
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    if (current.phase !== "playing") break;
    const before = current.currentIndex;
    const action = pickBotAction(current);
    if (!action || action.type === "nextRound") break;
    const result = applyAction(current, current.players[current.currentIndex].id, action);
    if (!result.ok) break;
    current = result.state;
    if (current.currentIndex !== before || current.phase !== "playing") break;
  }
  return current;
}

export function openingHint(hand: Tile[], minPairs: number): { goingPairs: boolean; groups: string[][] } | null {
  const groups = findNormalOpening(hand);
  if (groups) return { goingPairs: false, groups };
  const pairs = findPairOpening(hand, minPairs);
  if (pairs) return { goingPairs: true, groups: pairs };
  return null;
}

export function validateSelected(tiles: Tile[], goingPairs: boolean) {
  return validateMeld(tiles, goingPairs);
}

export { without };
