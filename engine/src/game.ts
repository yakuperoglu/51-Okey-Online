import { applyAttach, isPlayableOnTable } from "./process.js";
import { validateMeld } from "./melds.js";
import { applyRoundScores } from "./scoring.js";
import {
  applyOkeyTransform,
  cloneTile,
  createDeck,
  describeTile,
  okeyFromIndicator,
  shuffle,
} from "./tiles.js";
import {
  DEFAULT_CONFIG,
  type ActionResult,
  type ClientGameState,
  type GameAction,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerState,
  type PublicPlayer,
  type TableMeld,
  type Tile,
  type ValidatedMeld,
} from "./types.js";

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function fail(state: GameState, error: string): ActionResult {
  return { ok: false, error, state };
}

function ok(state: GameState): ActionResult {
  return { ok: true, state };
}

function pushEvent(state: GameState, text: string, kind: GameEvent["kind"]): void {
  state.eventSeq += 1;
  state.events.push({ id: `e${state.eventSeq}`, text, kind });
  if (state.events.length > 40) state.events.splice(0, state.events.length - 40);
}

function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentIndex];
}

function prevIndex(state: GameState): number {
  return (state.currentIndex + 3) % 4;
}

function takeFromHand(player: PlayerState, ids: string[]): { tiles: Tile[] } | { error: string } {
  const unique = new Set(ids);
  if (unique.size !== ids.length) return { error: "Aynı taş birden fazla kullanılamaz." };
  const tiles: Tile[] = [];
  for (const id of ids) {
    const tile = player.hand.find((t) => t.id === id);
    if (!tile) return { error: "Seçilen taş ıstakanda yok." };
    tiles.push(tile);
  }
  return { tiles };
}

function removeFromHand(player: PlayerState, ids: string[]): void {
  const drop = new Set(ids);
  player.hand = player.hand.filter((t) => !drop.has(t.id));
}

function toTableMeld(ownerId: string, meld: ValidatedMeld, id: string): TableMeld {
  return {
    id,
    type: meld.type,
    ownerId,
    tiles: meld.tiles.map(cloneTile),
    color: meld.color,
    values: meld.values,
    wrap: meld.wrap,
    setValue: meld.setValue,
    okeyAs: meld.okeyAs,
    addedBy: Object.fromEntries(meld.tiles.map((tile) => [tile.id, ownerId])),
  };
}

function dealHands(
  players: PlayerState[],
  starterIndex: number,
  rng: () => number,
): { indicator: Tile; okey: GameState["okey"]; drawPile: Tile[] } {
  let deck = shuffle(createDeck(), rng);
  const counts = players.map((_, i) => (i === starterIndex ? 15 : 14));
  for (let i = 0; i < players.length; i++) {
    const n = counts[i];
    players[i].hand = deck.slice(0, n);
    deck = deck.slice(n);
    players[i].discard = [];
    players[i].opened = false;
    players[i].goingPairs = false;
    players[i].lastPenalty = undefined;
  }

  let indicator = deck[0];
  deck = deck.slice(1);
  while (indicator.kind === "fakeOkey") {
    deck.push(indicator);
    deck = shuffle(deck, rng);
    indicator = deck[0];
    deck = deck.slice(1);
  }

  const okey = okeyFromIndicator(indicator);
  indicator = applyOkeyTransform([indicator], okey)[0];
  deck = applyOkeyTransform(deck, okey);
  for (const p of players) p.hand = applyOkeyTransform(p.hand, okey);

  return { indicator, okey, drawPile: deck };
}

export function createMatch(
  seats: { id: string; name: string; isBot: boolean; avatarId?: string }[],
  config: Partial<GameConfig> = {},
  rng: () => number = Math.random,
): GameState {
  if (seats.length !== 4) throw new Error("51 Okey 4 oyuncu ister.");
  const ruleset = config.ruleset ?? DEFAULT_CONFIG.ruleset;
  const cfg: GameConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    ruleset,
    pairing: config.pairing ?? DEFAULT_CONFIG.pairing,
    potContribution: config.potContribution ?? (ruleset === "kanli" ? 10 : 0),
  };
  const starterIndex = Math.floor(rng() * 4);
  const players: PlayerState[] = seats.map((s) => ({
    id: s.id,
    name: s.name,
    avatarId: s.avatarId,
    isBot: s.isBot,
    connected: true,
    hand: [],
    discard: [],
    opened: false,
    goingPairs: false,
    score: 0,
  }));

  const dealt = dealHands(players, starterIndex, rng);
  const state: GameState = {
    config: cfg,
    round: 1,
    phase: "playing",
    starterIndex,
    currentIndex: starterIndex,
    turn: { hasDrawn: true, mustUseTileId: null, tookDiscard: false },
    indicator: dealt.indicator,
    okey: dealt.okey,
    drawPile: dealt.drawPile,
    players,
    tableMelds: [],
    pot: cfg.potContribution * 4,
    events: [],
    finish: null,
    meldSeq: 0,
    eventSeq: 0,
  };
  pushEvent(
    state,
    `El ${state.round} başladı. Gösterge ${describeTile(state.indicator)}, okey ${describeTile({
      id: "ok",
      color: state.okey.color,
      value: state.okey.value,
      kind: "normal",
    })}.`,
    "info",
  );
  pushEvent(state, `İlk sıra: ${players[starterIndex].name} (15 taş).`, "info");
  return state;
}

function startNextRound(state: GameState, rng: () => number): GameState {
  const next = cloneState(state);
  next.round += 1;
  next.phase = "playing";
  next.starterIndex = (next.starterIndex + 1) % 4;
  next.currentIndex = next.starterIndex;
  next.turn = { hasDrawn: true, mustUseTileId: null, tookDiscard: false };
  next.tableMelds = [];
  next.finish = null;
  next.meldSeq = 0;
  const dealt = dealHands(next.players, next.starterIndex, rng);
  next.indicator = dealt.indicator;
  next.okey = dealt.okey;
  next.drawPile = dealt.drawPile;
  next.pot += next.config.potContribution * 4;
  pushEvent(
    next,
    `El ${next.round} başladı. Gösterge ${describeTile(next.indicator)}. Çanak: ${next.pot}.`,
    "info",
  );
  return next;
}

function advanceTurn(state: GameState): void {
  state.currentIndex = (state.currentIndex + 1) % 4;
  state.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
}

function sortHand(hand: Tile[]): Tile[] {
  const order = { yellow: 0, red: 1, black: 2, blue: 3 };
  return [...hand].sort((a, b) => {
    if (a.kind === "wildOkey" && b.kind !== "wildOkey") return -1;
    if (b.kind === "wildOkey" && a.kind !== "wildOkey") return 1;
    if (a.color !== b.color) return order[a.color] - order[b.color];
    return a.value - b.value;
  });
}

function applyOpen(state: GameState, action: Extract<GameAction, { type: "open" }>): ActionResult {
  const player = currentPlayer(state);
  if (!state.turn.hasDrawn) return fail(state, "Önce taş çekmelisin.");
  if (action.groups.length === 0) return fail(state, "Açmak için en az bir per seç.");

  if (player.opened && player.goingPairs && !action.goingPairs) {
    return fail(state, "Çifte giden oyuncu sadece çift açabilir.");
  }
  if (player.opened && !player.goingPairs && action.goingPairs) {
    return fail(state, "Normal per açtıktan sonra çifte dönülemez.");
  }

  const goingPairs = player.opened ? player.goingPairs : action.goingPairs;
  const used: string[] = [];
  const validated: ValidatedMeld[] = [];

  for (const group of action.groups) {
    used.push(...group);
    const taken = takeFromHand(player, group);
    if ("error" in taken) return fail(state, taken.error);
    const result = validateMeld(taken.tiles, goingPairs);
    if (!result.ok) {
      if (!player.opened) {
        player.score += state.config.penalty;
        player.lastPenalty = "Yanlış açma";
        pushEvent(
          state,
          `${player.name} hatalı açtı (${result.error}) ve ${state.config.penalty} ceza yedi.`,
          "penalty",
        );
        return ok(state);
      }
      return fail(state, result.error);
    }
    validated.push(result.meld);
  }

  if (new Set(used).size !== used.length) return fail(state, "Aynı taş birden fazla perede olamaz.");

  if (state.turn.mustUseTileId && !used.includes(state.turn.mustUseTileId)) {
    return fail(state, "Yerden alınan taş açtığın perlerden birinde kullanılmalı.");
  }

  if (!player.opened) {
    if (goingPairs) {
      if (validated.length < state.config.minPairs) {
        player.score += state.config.penalty;
        player.lastPenalty = "Yanlış açma";
        pushEvent(
          state,
          `${player.name} yetersiz çiftle inmeye çalıştı ve ${state.config.penalty} ceza yedi.`,
          "penalty",
        );
        return ok(state);
      }
    } else {
      const points = validated.reduce((s, m) => s + m.points, 0);
      if (points < 51) {
        player.score += state.config.penalty;
        player.lastPenalty = "Yanlış açma";
        pushEvent(
          state,
          `${player.name} 51 barajını geçemedi (${points}) ve ${state.config.penalty} ceza yedi.`,
          "penalty",
        );
        return ok(state);
      }
    }
  }

  removeFromHand(player, used);
  for (const meld of validated) {
    state.meldSeq += 1;
    state.tableMelds.push(toTableMeld(player.id, meld, `m${state.meldSeq}`));
  }

  const firstOpen = !player.opened;
  player.opened = true;
  player.goingPairs = goingPairs;
  player.hand = sortHand(player.hand);

  if (state.turn.mustUseTileId && used.includes(state.turn.mustUseTileId)) {
    state.turn.mustUseTileId = null;
  }

  if (firstOpen && goingPairs) {
    pushEvent(state, `${player.name} çifte gitti (${validated.length} çift).`, "open");
  } else if (firstOpen) {
    const points = validated.reduce((s, m) => s + m.points, 0);
    pushEvent(state, `${player.name} elini açtı (${points} puan).`, "open");
  } else {
    pushEvent(state, `${player.name} masaya yeni per indirdi.`, "open");
  }

  return ok(state);
}

function applyProcess(
  state: GameState,
  action: Extract<GameAction, { type: "process" }>,
): ActionResult {
  const player = currentPlayer(state);
  if (!state.turn.hasDrawn) return fail(state, "Önce taş çekmelisin.");
  if (!player.opened) return fail(state, "İşlemek için önce elini açmalısın.");

  if (player.goingPairs && action.place !== "swapOkey") {
    return fail(state, "Çifte giden oyuncu seri/eşli perlere işleyemez. Sadece çift açabilir.");
  }

  const tile = player.hand.find((t) => t.id === action.tileId);
  if (!tile) return fail(state, "Bu taş ıstakanda yok.");

  if (state.turn.mustUseTileId && tile.id !== state.turn.mustUseTileId && action.place !== "swapOkey") {
    return fail(state, "Yerden alınan taşı bu elde kullanmalısın.");
  }

  const meldIndex = state.tableMelds.findIndex((m) => m.id === action.meldId);
  if (meldIndex < 0) return fail(state, "Per bulunamadı.");
  const meld = state.tableMelds[meldIndex];

  const result = applyAttach(meld, tile, action.place);
  if (!result.ok) return fail(state, result.error);

  removeFromHand(player, [tile.id]);
  const addedBy = { ...(result.meld.addedBy ?? meld.addedBy ?? {}) };
  addedBy[tile.id] = player.id;
  if (result.returned) delete addedBy[result.returned.id];
  state.tableMelds[meldIndex] = { ...result.meld, addedBy };
  if (result.returned) {
    player.hand.push(result.returned);
    player.hand = sortHand(player.hand);
    pushEvent(state, `${player.name} masadaki okeyi gerçek taşla değiştirdi.`, "process");
  } else {
    pushEvent(state, `${player.name} ${describeTile(tile)} taşını işledi.`, "process");
  }

  if (state.turn.mustUseTileId === tile.id) state.turn.mustUseTileId = null;
  return ok(state);
}

function endRound(state: GameState, winner: PlayerState, discarded: Tile): void {
  const withOkey = discarded.kind === "wildOkey";
  const withPairs = winner.goingPairs;
  const scored = applyRoundScores(state.players, winner.id, state.config, withOkey, withPairs);
  state.players = scored.players;
  state.finish = scored.finish;
  state.phase = "roundEnd";

  if (withOkey && state.pot > 0) {
    const w = state.players.find((p) => p.id === winner.id)!;
    w.score -= state.pot;
    pushEvent(state, `${winner.name} kanlı bitişle çanağı (${state.pot}) aldı.`, "finish");
    state.pot = 0;
  }

  const label = withPairs && withOkey
    ? "çifte gidip okey atarak bitti (-404)"
    : withOkey
      ? "okey atarak bitti (-202, kanlı)"
      : withPairs
        ? "çifte giderek bitti (-202)"
        : "normal bitti (-101)";
  pushEvent(state, `${winner.name} ${label}.`, "finish");
}

function applyDiscard(state: GameState, tileId: string): ActionResult {
  const player = currentPlayer(state);
  if (!state.turn.hasDrawn) return fail(state, "Önce taş çekmelisin.");
  if (state.turn.mustUseTileId) {
    return fail(state, "Yerden alınan taşı açtığın/işlediğin perde kullanmadan atamazsın.");
  }

  const tile = player.hand.find((t) => t.id === tileId);
  if (!tile) return fail(state, "Bu taş ıstakanda yok.");

  const remaining = player.hand.length - 1;
  const finishing = remaining === 0 && player.opened;

  if (remaining === 0 && !player.opened) {
    return fail(state, "Elini açmadan bitiremezsin.");
  }

  if (!finishing) {
    if (tile.kind === "wildOkey") {
      player.score += state.config.penalty;
      player.lastPenalty = "Okey atma";
      pushEvent(state, `${player.name} okey attı: +${state.config.penalty} ceza.`, "penalty");
    } else if (isPlayableOnTable(state.tableMelds, tile)) {
      player.score += state.config.penalty;
      player.lastPenalty = "İşlek taş atma";
      pushEvent(
        state,
        `${player.name} işlek taş (${describeTile(tile)}) attı: +${state.config.penalty} ceza.`,
        "penalty",
      );
    }
  }

  removeFromHand(player, [tile.id]);
  player.discard.push(tile);
  pushEvent(state, `${player.name} ${describeTile(tile)} attı.`, "info");

  if (finishing) {
    endRound(state, player, tile);
    return ok(state);
  }

  advanceTurn(state);
  return ok(state);
}

export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  rng: () => number = Math.random,
): ActionResult {
  const next = cloneState(state);

  if (action.type === "nextRound") {
    if (next.phase !== "roundEnd") return fail(next, "El henüz bitmedi.");
    return ok(startNextRound(next, rng));
  }

  if (next.phase !== "playing") return fail(next, "El bitti. Yeni el başlatın.");
  const player = currentPlayer(next);
  if (player.id !== playerId) return fail(next, "Sıra sende değil.");

  if (action.type === "drawPile") {
    if (next.turn.hasDrawn) return fail(next, "Bu elde zaten taş çektin.");
    if (next.drawPile.length === 0) {
      pushEvent(next, "Kapalı taşlar bitti, el berabere kapandı.", "info");
      next.phase = "roundEnd";
      return ok(next);
    }
    const tile = next.drawPile.shift()!;
    player.hand.push(tile);
    player.hand = sortHand(player.hand);
    next.turn.hasDrawn = true;
    pushEvent(next, `${player.name} desteden taş çekti.`, "info");
    return ok(next);
  }

  if (action.type === "drawDiscard") {
    if (next.turn.hasDrawn) return fail(next, "Bu elde zaten taş çektin.");
    const prev = next.players[prevIndex(next)];
    const tile = prev.discard[prev.discard.length - 1];
    if (!tile) return fail(next, "Yerde alınacak taş yok.");

    prev.discard = prev.discard.slice(0, -1);
    player.hand.push(tile);
    player.hand = sortHand(player.hand);
    next.turn.hasDrawn = true;
    next.turn.tookDiscard = true;
    next.turn.mustUseTileId = tile.id;
    pushEvent(next, `${player.name} yerden ${describeTile(tile)} aldı.`, "info");
    return ok(next);
  }

  if (action.type === "open") return applyOpen(next, action);
  if (action.type === "process") return applyProcess(next, action);
  if (action.type === "discard") return applyDiscard(next, action.tileId);

  return fail(next, "Bilinmeyen hamle.");
}

export function serializeFor(state: GameState, playerId: string): ClientGameState {
  const yourIndex = state.players.findIndex((p) => p.id === playerId);
  const you = state.players[yourIndex];
  return {
    round: state.round,
    phase: state.phase,
    starterIndex: state.starterIndex,
    currentIndex: state.currentIndex,
    currentPlayerId: state.players[state.currentIndex].id,
    yourId: playerId,
    yourIndex,
    isYourTurn: state.players[state.currentIndex].id === playerId && state.phase === "playing",
    turn: state.turn,
    indicator: state.indicator,
    okey: state.okey,
    drawPileCount: state.drawPile.length,
    players: state.players.map(
      (p): PublicPlayer => ({
        id: p.id,
        name: p.name,
        avatarId: p.avatarId,
        isBot: p.isBot,
        connected: p.connected,
        tileCount: p.hand.length,
        opened: p.opened,
        goingPairs: p.goingPairs,
        score: p.score,
        discard: p.discard.slice(-3),
        lastPenalty: p.lastPenalty,
      }),
    ),
    tableMelds: state.tableMelds,
    pot: state.pot,
    events: state.events.slice(-12),
    finish: state.finish,
    yourHand: you ? you.hand : [],
    config: state.config,
  };
}

export function legalDraw(state: GameState, playerId: string): { pile: boolean; discard: boolean } {
  if (state.phase !== "playing") return { pile: false, discard: false };
  const p = currentPlayer(state);
  if (p.id !== playerId || state.turn.hasDrawn) return { pile: false, discard: false };
  const prev = state.players[prevIndex(state)];
  return {
    pile: state.drawPile.length > 0,
    discard: prev.discard.length > 0,
  };
}
