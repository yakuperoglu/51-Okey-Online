import { describe, expect, it } from "vitest";
import { validateSeries, validateSet, validatePair, validateMeld } from "./melds.js";
import { applyOkeyTransform, createDeck, leftoverValue, okeyFromIndicator } from "./tiles.js";
import { applyRoundScores, finishMultiplier, loserDelta, winnerDelta } from "./scoring.js";
import { canAttach, isPlayableOnTable } from "./process.js";
import { applyAction, createMatch } from "./game.js";
import { DEFAULT_CONFIG, type PlayerState, type TableMeld, type Tile } from "./types.js";

function t(id: string, color: Tile["color"], value: number, kind: Tile["kind"] = "normal"): Tile {
  return { id, color, value, kind };
}

describe("taş seti", () => {
  it("106 taş üretir: 104 normal + 2 sahte okey", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(106);
    expect(deck.filter((x) => x.kind === "fakeOkey")).toHaveLength(2);
  });

  it("gösterge kırmızı 4 ise okey kırmızı 5 olur", () => {
    expect(okeyFromIndicator(t("i", "red", 4))).toEqual({ color: "red", value: 5 });
  });

  it("gösterge 13 ise okey 1 olur", () => {
    expect(okeyFromIndicator(t("i", "blue", 13))).toEqual({ color: "blue", value: 1 });
  });

  it("gerçek okey taşlarını joker, sahte okeyleri okey numarasına çevirir", () => {
    const okey = { color: "red" as const, value: 5 };
    const tiles = applyOkeyTransform(
      [
        t("r5a", "red", 5),
        t("fake-0", "yellow", 0, "fakeOkey"),
        t("y7", "yellow", 7),
      ],
      okey,
    );
    expect(tiles[0].kind).toBe("wildOkey");
    expect(tiles[1].kind).toBe("normal");
    expect(tiles[1].color).toBe("red");
    expect(tiles[1].value).toBe(5);
    expect(tiles[2].kind).toBe("normal");
  });
});

describe("per kuralları", () => {
  it("sarı 5-6-7 serisini kabul eder", () => {
    const r = validateSeries([t("a", "yellow", 5), t("b", "yellow", 6), t("c", "yellow", 7)]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meld.points).toBe(18);
  });

  it("12-13-1 serisini kabul eder, 12-13-1-2 reddeder", () => {
    const wrap = validateSeries([
      t("a", "red", 12),
      t("b", "red", 13),
      t("c", "red", 1),
    ]);
    expect(wrap.ok).toBe(true);
    const bad = validateSeries([
      t("a", "red", 12),
      t("b", "red", 13),
      t("c", "red", 1),
      t("d", "red", 2),
    ]);
    expect(bad.ok).toBe(false);
  });

  it("eşli per puanını taş sayılarıyla hesaplar", () => {
    const r = validateSet([t("a", "red", 8), t("b", "black", 8), t("c", "blue", 8)]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meld.points).toBe(24);
  });

  it("51 baraj örneği: 10-11-12 + 8-8-8 = 57", () => {
    const s = validateSeries([t("a", "yellow", 10), t("b", "yellow", 11), t("c", "yellow", 12)]);
    const k = validateSet([t("d", "black", 8), t("e", "red", 8), t("f", "blue", 8)]);
    expect(s.ok && k.ok).toBe(true);
    if (s.ok && k.ok) expect(s.meld.points + k.meld.points).toBe(57);
  });

  it("okey yerine geçtiği taşın puanını alır", () => {
    const r = validateSeries([
      t("a", "yellow", 10),
      t("ok", "red", 5, "wildOkey"),
      t("c", "yellow", 12),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meld.points).toBe(33);
  });

  it("çift aynı renk ve sayı ister", () => {
    expect(validatePair([t("a", "blue", 4), t("b", "blue", 4)]).ok).toBe(true);
    expect(validatePair([t("a", "blue", 4), t("b", "red", 4)]).ok).toBe(false);
  });

  it("normal açılışta 2 taşlık grubu reddeder", () => {
    expect(validateMeld([t("a", "blue", 4), t("b", "blue", 4)], false).ok).toBe(false);
  });
});

describe("işleme", () => {
  it("serinin sağına ve soluna eklenebilir taşı tespit eder", () => {
    const meld: TableMeld = {
      id: "m1",
      type: "series",
      ownerId: "p",
      tiles: [t("a", "yellow", 5), t("b", "yellow", 6), t("c", "yellow", 7)],
      color: "yellow",
      values: [5, 6, 7],
      wrap: false,
      okeyAs: {},
    };
    expect(canAttach(meld, t("d", "yellow", 4))).toContain("left");
    expect(canAttach(meld, t("e", "yellow", 8))).toContain("right");
    expect(canAttach(meld, t("f", "yellow", 9)).length).toBe(0);
    expect(isPlayableOnTable([meld], t("e", "yellow", 8))).toBe(true);
  });

  it("13'lü seriye 1 eklenince wrap olur", () => {
    const meld: TableMeld = {
      id: "m1",
      type: "series",
      ownerId: "p",
      tiles: [t("a", "blue", 11), t("b", "blue", 12), t("c", "blue", 13)],
      color: "blue",
      values: [11, 12, 13],
      wrap: false,
      okeyAs: {},
    };
    expect(canAttach(meld, t("d", "blue", 1))).toContain("right");
  });
});

describe("puanlama", () => {
  const base = (over: Partial<PlayerState>): PlayerState => ({
    id: "p",
    name: "P",
    isBot: false,
    connected: true,
    hand: [],
    discard: [],
    opened: false,
    goingPairs: false,
    score: 0,
    ...over,
  });

  it("bitiş çarpanları doğru", () => {
    expect(finishMultiplier(false, false)).toBe(1);
    expect(finishMultiplier(true, false)).toBe(2);
    expect(finishMultiplier(false, true)).toBe(2);
    expect(finishMultiplier(true, true)).toBe(4);
    expect(winnerDelta(DEFAULT_CONFIG, false, false)).toBe(-101);
    expect(winnerDelta(DEFAULT_CONFIG, true, false)).toBe(-202);
    expect(winnerDelta(DEFAULT_CONFIG, false, true)).toBe(-202);
    expect(winnerDelta(DEFAULT_CONFIG, true, true)).toBe(-404);
  });

  it("açmamış oyuncu 101, okey bitişte 202, çifte+okey 404 yer", () => {
    const p = base({ opened: false });
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: false, withPairs: false })).toBe(101);
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: true, withPairs: false })).toBe(202);
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: true, withPairs: true })).toBe(404);
  });

  it("açmış oyuncunun kalan taş toplamı, okeyde x2", () => {
    const p = base({
      opened: true,
      hand: [t("a", "red", 10), t("b", "blue", 5)],
    });
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: false, withPairs: false })).toBe(15);
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: true, withPairs: false })).toBe(30);
  });

  it("çifte açıp bitemeyen x2, okeyde x4", () => {
    const p = base({
      opened: true,
      goingPairs: true,
      hand: [t("a", "red", 10)],
    });
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: false, withPairs: false })).toBe(20);
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: true, withPairs: false })).toBe(40);
  });

  it("kalan okey 25 sayılır", () => {
    expect(leftoverValue(t("ok", "red", 5, "wildOkey"))).toBe(25);
  });

  it("4 oyuncuya round skorunu uygular", () => {
    const players = [
      base({ id: "w", name: "W", opened: true }),
      base({ id: "a", opened: false }),
      base({
        id: "b",
        opened: true,
        hand: [t("x", "yellow", 7)],
      }),
      base({ id: "c", opened: true, goingPairs: true, hand: [t("y", "blue", 3)] }),
    ];
    const { finish, players: next } = applyRoundScores(players, "w", DEFAULT_CONFIG, false, false);
    expect(finish.winnerDelta).toBe(-101);
    expect(next.find((p) => p.id === "a")?.score).toBe(101);
    expect(next.find((p) => p.id === "b")?.score).toBe(7);
    expect(next.find((p) => p.id === "c")?.score).toBe(6);
  });

  it("çiftli oyunda kazananın eşi de aynı puanı alır", () => {
    const players = [
      base({ id: "w", name: "W", opened: true }),
      base({ id: "a", opened: false }),
      base({ id: "p", name: "Partner", opened: true }),
      base({ id: "c", opened: false }),
    ];
    const cfg = { ...DEFAULT_CONFIG, pairing: "ciftli" as const };
    const { players: next } = applyRoundScores(players, "w", cfg, false, false);
    expect(next.find((p) => p.id === "w")?.score).toBe(-101);
    expect(next.find((p) => p.id === "p")?.score).toBe(-101);
    expect(next.find((p) => p.id === "a")?.score).toBe(101);
    expect(next.find((p) => p.id === "c")?.score).toBe(101);
  });
});

describe("oyun akışı", () => {
  it("başlayana 15, diğerlerine 14 taş verir", () => {
    const state = createMatch(
      [
        { id: "a", name: "A", isBot: false },
        { id: "b", name: "B", isBot: false },
        { id: "c", name: "C", isBot: false },
        { id: "d", name: "D", isBot: false },
      ],
      {},
      () => 0.1,
    );
    const counts = state.players.map((p) => p.hand.length).sort((x, y) => y - x);
    expect(counts).toEqual([15, 14, 14, 14]);
    expect(state.players[state.starterIndex].hand).toHaveLength(15);
    expect(state.turn.hasDrawn).toBe(true);
    expect(state.drawPile.length + 1 + 57).toBe(106);
  });

  it("normal 51 çanaksız, kanlı 51 çanaklı başlar", () => {
    const seats = [
      { id: "a", name: "A", isBot: false },
      { id: "b", name: "B", isBot: false },
      { id: "c", name: "C", isBot: false },
      { id: "d", name: "D", isBot: false },
    ];
    const normal = createMatch(seats, { ruleset: "normal" }, () => 0.1);
    const kanli = createMatch(seats, { ruleset: "kanli" }, () => 0.1);
    expect(normal.pot).toBe(0);
    expect(kanli.pot).toBe(40);
  });

  it("sıra dışındaki oyuncunun hamlesini reddeder", () => {
    const state = createMatch(
      [
        { id: "a", name: "A", isBot: false },
        { id: "b", name: "B", isBot: false },
        { id: "c", name: "C", isBot: false },
        { id: "d", name: "D", isBot: false },
      ],
      {},
      () => 0,
    );
    const other = state.players.find((p) => p.id !== state.players[state.currentIndex].id)!;
    const result = applyAction(state, other.id, { type: "drawPile" });
    expect(result.ok).toBe(false);
  });
});
