import {
  bestPairArrangement,
  bestSeriesArrangement,
  findOpeningGroups,
  findPairGroups,
} from "./arrange.js";
import { applyAction } from "./game.js";
import { validateMeld } from "./melds.js";
import { canAttach, canSwapOkey, isPlayableOnTable } from "./process.js";
import type { GameAction, GameState, Tile } from "./types.js";

function without(hand: Tile[], used: Set<string>): Tile[] {
  return hand.filter((t) => !used.has(t.id));
}

export function findNormalOpening(hand: Tile[], mustUse?: string): string[][] | null {
  return findOpeningGroups(hand, mustUse);
}

export function findPairOpening(hand: Tile[], minPairs: number, mustUse?: string): string[][] | null {
  return findPairGroups(hand, minPairs, mustUse);
}

/** Melds an already-opened player can lay down right now (empty if none). */
function extraMelds(state: GameState, hand: Tile[]): string[][] {
  const player = state.players[state.currentIndex];
  if (player.goingPairs) return bestPairArrangement(hand).groups;
  const r = bestSeriesArrangement(hand);
  return r ? r.groups : [];
}

function pickDiscard(state: GameState, hand: Tile[], goingPairs: boolean): Tile {
  const arrangement = goingPairs
    ? bestPairArrangement(hand)
    : (bestSeriesArrangement(hand) ?? { rest: [] as string[] });
  const restIds = new Set(arrangement.rest);
  const byId = new Map(hand.map((t) => [t.id, t]));

  const score = (t: Tile): number => {
    // Lower score = better to throw away.
    let s = 0;
    if (t.kind === "wildOkey") s += 1000;
    if (isPlayableOnTable(state.tableMelds, t)) s += 500;
    if (!restIds.has(t.id)) s += 300; // part of a planned meld
    if (t.kind !== "wildOkey") {
      const mates = hand.filter(
        (o) =>
          o.id !== t.id &&
          o.kind !== "wildOkey" &&
          ((o.color === t.color && Math.abs(o.value - t.value) <= 2) ||
            (o.value === t.value && o.color !== t.color) ||
            (goingPairs && o.color === t.color && o.value === t.value)),
      ).length;
      s += mates * 20;
      s -= t.value; // prefer dumping high tiles
    }
    return s;
  };

  const pool = hand.filter((t) => byId.has(t.id));
  return [...pool].sort((a, b) => score(a) - score(b))[0];
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
    if (top) {
      const trial = [...hand, top];
      if (!player.opened) {
        const chosen =
          findNormalOpening(trial, top.id) ?? findPairOpening(trial, state.config.minPairs, top.id);
        if (chosen) return { type: "drawDiscard" };
      } else if (!player.goingPairs && isPlayableOnTable(state.tableMelds, top)) {
        return { type: "drawDiscard" };
      }
    }
    return { type: "drawPile" };
  }

  const mustUse = state.turn.mustUseTileId ?? undefined;

  if (!player.opened) {
    const groups = findNormalOpening(hand, mustUse);
    if (groups) return { type: "open", groups, goingPairs: false };
    const pairs = findPairOpening(hand, state.config.minPairs, mustUse);
    if (pairs) return { type: "open", groups: pairs, goingPairs: true };
  } else {
    // Attach to the table first: it never costs anything and sheds tiles.
    if (!player.goingPairs) {
      for (const tile of hand) {
        for (const meld of state.tableMelds) {
          if (canSwapOkey(meld, tile)) {
            return { type: "process", tileId: tile.id, meldId: meld.id, place: "swapOkey" };
          }
        }
      }
      for (const tile of hand) {
        if (tile.kind === "wildOkey") continue;
        for (const meld of state.tableMelds) {
          const places = canAttach(meld, tile);
          if (places[0]) {
            return { type: "process", tileId: tile.id, meldId: meld.id, place: places[0] };
          }
        }
      }
    }
    const extras = extraMelds(state, hand);
    if (extras.length) {
      return { type: "open", groups: extras, goingPairs: player.goingPairs };
    }
    if (!player.goingPairs) {
      // Okeys last: only attach them when nothing else is left to do.
      for (const tile of hand) {
        if (tile.kind !== "wildOkey") continue;
        for (const meld of state.tableMelds) {
          const places = canAttach(meld, tile);
          if (places[0]) {
            return { type: "process", tileId: tile.id, meldId: meld.id, place: places[0] };
          }
        }
      }
    }
  }

  if (mustUse) return null;
  if (hand.length === 0) return null;

  const pick = pickDiscard(state, hand, player.goingPairs);
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
