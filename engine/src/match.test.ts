import { describe, expect, it } from "vitest";
import { applyAction, createMatch, serializeFor } from "./game.js";
import { applyNoWinnerScores, applyRoundScores, handMultiplier, normalizeTotalRounds } from "./scoring.js";
import { DEFAULT_CONFIG, type GameState, type PlayerState, type Tile } from "./types.js";

function t(id: string, color: Tile["color"], value: number): Tile {
  return { id, color, value, kind: "normal" };
}

function pl(id: string, over: Partial<PlayerState> = {}): PlayerState {
  return { id, name: id, isBot: false, connected: true, hand: [], discard: [], opened: false, goingPairs: false, score: 0, ...over };
}

function fresh(config = {}): GameState {
  return createMatch(["a", "b", "c", "d"].map((id) => ({ id, name: id, isBot: false })), config, () => 0);
}

/** Make current player finish the hand by processing their last tile onto a meld. */
function finishHand(s: GameState): GameState {
  const p = s.players[s.currentIndex];
  p.opened = true;
  p.hand = [t("n1", "red", 4)];
  s.turn = { hasDrawn: true, mustUseTileId: null, tookDiscard: false };
  s.tableMelds = [
    { id: "m1", type: "series", ownerId: p.id, color: "red", values: [1, 2, 3], wrap: false, okeyAs: {}, tiles: [t("r1", "red", 1), t("r2", "red", 2), t("r3", "red", 3)] },
  ];
  const r = applyAction(s, p.id, { type: "process", tileId: "n1", meldId: "m1", place: "right" });
  expect(r.ok).toBe(true);
  return r.state;
}

describe("el çarpanı", () => {
  it("8, 6, 5, 4 döngüsü", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(handMultiplier)).toEqual([8, 6, 5, 4, 8, 6, 5, 4, 8]);
  });

  it("totalRounds 4'ün katına yuvarlanır, 4-16 dışı 8 olur", () => {
    expect(normalizeTotalRounds(12)).toBe(12);
    expect(normalizeTotalRounds(7)).toBe(8);
    expect(normalizeTotalRounds(5)).toBe(4);
    expect(normalizeTotalRounds(100)).toBe(8);
    expect(normalizeTotalRounds(0)).toBe(8);
    expect(normalizeTotalRounds("x")).toBe(8);
    expect(fresh({ totalRounds: 16 }).config.totalRounds).toBe(16);
    expect(fresh().config.totalRounds).toBe(8);
  });

  it("config her zaman çiftli ve 5 çift", () => {
    const s = fresh({ pairing: "tekli", minPairs: 4 });
    expect(s.config.pairing).toBe("ciftli");
    expect(s.config.minPairs).toBe(5);
  });

  it("puanlar el çarpanıyla çarpılır (kazanan, eş, açmayan, kalan taş)", () => {
    const players = [
      pl("w", { opened: true }),
      pl("a", { opened: false }),
      pl("p", { opened: true }),
      pl("c", { opened: true, hand: [t("x", "yellow", 7)] }),
    ];
    const { finish, players: next } = applyRoundScores(players, "w", DEFAULT_CONFIG, false, false, 6);
    expect(finish.handMultiplier).toBe(6);
    expect(finish.winnerDelta).toBe(-606);
    expect(next[0].score).toBe(-606);
    expect(next[2].score).toBe(-606);
    expect(next[1].score).toBe(606);
    expect(next[3].score).toBe(42);
    const okey = applyRoundScores(players, "w", DEFAULT_CONFIG, true, true, 4);
    expect(okey.finish.winnerDelta).toBe(-101 * 4 * 4);
    expect(okey.players[1].score).toBe(101 * 4 * 4);
  });

  it("kazanansız el de çarpılır", () => {
    const next = applyNoWinnerScores([pl("a"), pl("b", { opened: true, hand: [t("x", "red", 5)] })], DEFAULT_CONFIG, 5);
    expect(next[0].score).toBe(505);
    expect(next[1].score).toBe(25);
  });

  it("oyunda bitiş 1. elde x8 yazar ve ClientGameState gösterir", () => {
    const s = fresh();
    const w = s.players[s.currentIndex].id;
    const e = finishHand(s);
    expect(e.phase).toBe("roundEnd");
    expect(e.finish?.handMultiplier).toBe(8);
    expect(e.finish?.winnerDelta).toBe(-808);
    expect(e.players.find((p) => p.id === w)?.score).toBe(-808);
    expect(serializeFor(e, w).handMultiplier).toBe(8);
  });

  it("geçmiş kayıt: el sonu delta ve çarpan", () => {
    let s = fresh();
    const w1 = s.players[s.currentIndex].id;
    s = finishHand(s);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].round).toBe(1);
    expect(s.history[0].multiplier).toBe(8);
    expect(s.history[0].deltas[w1]).toBe(-808);
    s = applyAction(s, w1, { type: "nextRound" }, () => 0).state;
    expect(s.round).toBe(2);
    expect(serializeFor(s, w1).handMultiplier).toBe(6);
    const w2 = s.players[s.currentIndex].id;
    s = finishHand(s);
    expect(s.history).toHaveLength(2);
    expect(s.history[1].multiplier).toBe(6);
    expect(s.history[1].deltas[w2]).toBe(-606);
    expect(serializeFor(s, w2).history).toHaveLength(2);
  });
});

describe("maç sonu", () => {
  it("son elden sonra matchEnd, kaybeden takım en yüksek puanlı oyuncunun takımı", () => {
    let s = fresh({ totalRounds: 4 });
    s.round = 4;
    s.roundStartScores = Object.fromEntries(s.players.map((p) => [p.id, p.score]));
    // a(0) and c(2) are a team; give b(1) the highest score via leftover
    s.players[1].score = 50;
    s.roundStartScores.b = 50;
    s.currentIndex = 0;
    s = finishHand(s);
    expect(s.phase).toBe("matchEnd");
    expect(s.finish?.handMultiplier).toBe(4);
    expect(s.history).toHaveLength(1);
    const r = s.matchResult!;
    expect(r).not.toBeNull();
    const top = [...s.players].sort((x, y) => y.score - x.score)[0];
    expect(r.highestPlayerId).toBe(top.id);
    expect(r.loserTeam).toContain(top.id);
    expect(r.winnerTeam).not.toContain(top.id);
    expect(r.teamTotals).toHaveLength(2);
    expect(serializeFor(s, "a").matchResult).toEqual(r);
  });

  it("en yüksek puan eşitse takım toplamı yüksek olan kaybeder", () => {
    let s = fresh({ totalRounds: 4 });
    s.round = 4;
    s.currentIndex = 0;
    // after the hand: a,c win (-404 each); b and d pay: set b=d via equal leftovers
    s.players[1].score = 1000;
    s.players[3].score = 1000;
    s.roundStartScores = Object.fromEntries(s.players.map((p) => [p.id, p.score]));
    s = finishHand(s);
    expect(s.phase).toBe("matchEnd");
    // b and d both unopened: equal +404 => tie on highest, team (b,d) total is higher
    expect(s.matchResult!.loserTeam).toEqual(["b", "d"]);
    expect(s.matchResult!.winnerTeam).toEqual(["a", "c"]);
  });

  it("matchEnd'de nextRound reddedilir; ara ellerde roundEnd", () => {
    let s = fresh({ totalRounds: 4 });
    s.round = 4;
    s = finishHand(s);
    expect(s.phase).toBe("matchEnd");
    const r = applyAction(s, "a", { type: "nextRound" }, () => 0);
    expect(r.ok).toBe(false);
    expect(r.state.phase).toBe("matchEnd");

    const mid = finishHand(fresh({ totalRounds: 8 }));
    expect(mid.phase).toBe("roundEnd");
    expect(mid.matchResult).toBeNull();
  });
});
