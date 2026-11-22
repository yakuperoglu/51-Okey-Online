import { describe, expect, it } from "vitest";
import { applyAction, createMatch, legalDraw } from "./game.js";
import { canAttach } from "./process.js";
import { loserDelta } from "./scoring.js";
import { validateMeld } from "./melds.js";
import { DEFAULT_CONFIG, type GameState, type TableMeld, type Tile } from "./types.js";

function t(id: string, color: Tile["color"], value: number, kind: Tile["kind"] = "normal"): Tile {
  return { id, color, value, kind };
}

function fresh(): GameState {
  return createMatch(
    ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), isBot: false })),
    {},
    () => 0,
  );
}

describe("kural düzeltmeleri", () => {
  it("1'den 13'e tam seriye tekrar 1 eklenemez", () => {
    const vals = Array.from({ length: 13 }, (_, i) => i + 1);
    const meld: TableMeld = {
      id: "m", type: "series", ownerId: "p", color: "red", values: vals, wrap: false, okeyAs: {},
      tiles: vals.map((v) => t(`r${v}`, "red", v)),
    };
    expect(canAttach(meld, t("x", "red", 1))).toEqual([]);
  });

  it("çifte bitirme açmamış oyuncuya da 2x yazar", () => {
    const p = { id: "p", name: "P", isBot: false, connected: true, hand: [], discard: [], opened: false, goingPairs: false, score: 0 };
    expect(loserDelta(p, DEFAULT_CONFIG, { withOkey: false, withPairs: true })).toBe(202);
  });

  it("okey+okey+tek taş en çok puan veren okuma ile doğrulanır", () => {
    const r = validateMeld([t("a", "red", 7), t("w1", "red", 5, "wildOkey"), t("w2", "red", 5, "wildOkey")], false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meld.points).toBe(24); // 7-8-9 seri, eşli 21 değil
  });

  it("kullanamayacağı yer taşı da alınabilir (geri bırakma ile)", () => {
    const s = fresh();
    const cur = s.currentIndex;
    const next = (cur + 1) % 4;
    s.players[next].hand = [t("h1", "red", 1), t("h2", "blue", 9), t("h3", "black", 4)];
    s.players[cur].discard = [t("junk", "yellow", 13)];
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    s.currentIndex = next;
    expect(legalDraw(s, s.players[next].id).discard).toBe(true);
    const r = applyAction(s, s.players[next].id, { type: "drawDiscard" });
    expect(r.ok).toBe(true);
    expect(r.state.players[next].hand.some((h) => h.id === "junk")).toBe(true);
    expect(r.state.turn).toEqual({ hasDrawn: true, mustUseTileId: "junk", tookDiscard: true });
  });

  it("returnDiscard taşı yere geri koyar ve sırayı sıfırlar", () => {
    const s = fresh();
    const cur = s.currentIndex;
    const next = (cur + 1) % 4;
    s.players[next].hand = [t("h1", "red", 1), t("h2", "blue", 9), t("h3", "black", 4)];
    s.players[cur].discard = [t("old", "red", 2), t("junk", "yellow", 13)];
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    s.currentIndex = next;
    const id = s.players[next].id;
    const took = applyAction(s, id, { type: "drawDiscard" });
    expect(took.ok).toBe(true);
    const back = applyAction(took.state, id, { type: "returnDiscard" });
    expect(back.ok).toBe(true);
    expect(back.state.players[cur].discard.map((d) => d.id)).toEqual(["old", "junk"]);
    expect(back.state.players[next].hand.map((h) => h.id).sort()).toEqual(["h1", "h2", "h3"]);
    expect(back.state.turn).toEqual({ hasDrawn: false, mustUseTileId: null, tookDiscard: false });
    expect(back.state.currentIndex).toBe(next);
    // must draw again: from the pile
    expect(applyAction(back.state, id, { type: "drawPile" }).ok).toBe(true);
  });

  it("returnDiscard: taş alınmadıysa reddedilir", () => {
    const s = fresh();
    const p = s.players[s.currentIndex];
    s.turn = { hasDrawn: true, mustUseTileId: null, tookDiscard: false };
    expect(applyAction(s, p.id, { type: "returnDiscard" }).ok).toBe(false);
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    expect(applyAction(s, p.id, { type: "returnDiscard" }).ok).toBe(false);
  });

  it("returnDiscard: taş kullanıldıktan sonra reddedilir", () => {
    const s = fresh();
    const cur = s.currentIndex;
    const next = (cur + 1) % 4;
    const id = s.players[next].id;
    s.players[next].hand = [t("a", "red", 5), t("b", "red", 6), t("c", "red", 7), t("x", "blue", 1)];
    s.players[next].opened = true;
    s.tableMelds = [
      { id: "m1", type: "series", ownerId: "z", color: "red", values: [1, 2, 3], wrap: false, okeyAs: {}, tiles: [t("r1", "red", 1), t("r2", "red", 2), t("r3", "red", 3)] },
    ];
    s.players[cur].discard = [t("r4", "red", 4)];
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    s.currentIndex = next;
    const took = applyAction(s, id, { type: "drawDiscard" });
    expect(took.ok).toBe(true);
    const used = applyAction(took.state, id, { type: "process", tileId: "r4", meldId: "m1", place: "right" });
    expect(used.ok).toBe(true);
    expect(used.state.turn.mustUseTileId).toBeNull();
    expect(applyAction(used.state, id, { type: "returnDiscard" }).ok).toBe(false);
  });

  it("açmış oyuncu eli tamamen bitirirse atmadan el biter", () => {
    const s = fresh();
    const p = s.players[s.currentIndex];
    p.opened = true;
    p.hand = [t("n1", "red", 4)];
    s.tableMelds = [
      { id: "m1", type: "series", ownerId: "x", color: "red", values: [1, 2, 3], wrap: false, okeyAs: {}, tiles: [t("r1", "red", 1), t("r2", "red", 2), t("r3", "red", 3)] },
    ];
    const r = applyAction(s, p.id, { type: "process", tileId: "n1", meldId: "m1", place: "right" });
    expect(r.ok).toBe(true);
    expect(r.state.phase).toBe("roundEnd");
    expect(r.state.finish?.winnerId).toBe(p.id);
  });

  it("kapalı deste bitince el puanlanır", () => {
    const s = fresh();
    const idx = (s.starterIndex + 1) % 4;
    s.currentIndex = idx;
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    s.drawPile = [];
    const r = applyAction(s, s.players[idx].id, { type: "drawPile" });
    expect(r.state.phase).toBe("roundEnd");
    expect(r.state.players.every((p) => p.score > 0)).toBe(true);
  });
});
