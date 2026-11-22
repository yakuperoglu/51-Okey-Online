import { describe, expect, it } from "vitest";
import { applyAction, createMatch } from "./game.js";
import type { GameState, TableMeld, Tile } from "./types.js";

function t(id: string, color: Tile["color"], value: number, kind: Tile["kind"] = "normal"): Tile {
  return { id, color, value, kind };
}

/** Current player is index 1 (B); previous player is index 0 (A). */
function setup(): GameState {
  const s = createMatch(
    ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), isBot: false })),
    {},
    () => 0,
  );
  s.currentIndex = 1;
  s.turn = { hasDrawn: true, mustUseTileId: null, tookDiscard: false };
  for (const p of s.players) {
    p.hand = [t(`${p.id}-x`, "blue", 13)];
    p.discard = [];
    p.opened = false;
    p.score = 0;
  }
  s.tableMelds = [];
  return s;
}

function meldOf(owner: string, id = "m1"): TableMeld {
  const vals = [1, 2, 3];
  return {
    id, type: "series", ownerId: owner, color: "red", values: vals, wrap: false, okeyAs: {},
    tiles: vals.map((v) => t(`${id}r${v}`, "red", v)),
  };
}

describe("ceza kuralları", () => {
  it("başkasının perine işleyince sahibi değer x10 ceza alır", () => {
    const s = setup();
    s.players[1].opened = true;
    s.players[1].hand.push(t("r4", "red", 4));
    s.tableMelds = [meldOf("c")];
    const r = applyAction(s, "b", { type: "process", tileId: "r4", meldId: "m1", place: "right" });
    expect(r.ok).toBe(true);
    expect(r.state.players[2].score).toBe(40);
    expect(r.state.players[1].score).toBe(0);
    expect(r.state.events.some((e) => e.text.includes("işlek cezası: +40"))).toBe(true);
  });

  it("kendi perine işleyince ceza yok", () => {
    const s = setup();
    s.players[1].opened = true;
    s.players[1].hand.push(t("r4", "red", 4));
    s.tableMelds = [meldOf("b")];
    const r = applyAction(s, "b", { type: "process", tileId: "r4", meldId: "m1", place: "right" });
    expect(r.ok).toBe(true);
    expect(r.state.players.map((p) => p.score)).toEqual([0, 0, 0, 0]);
  });

  it("yerden alınan taş açılışta kullanılırsa atana değer x10 ceza", () => {
    const s = setup();
    s.players[0].discard = [t("k12", "black", 12)];
    s.players[1].hand = [t("k11", "black", 11), t("k13", "black", 13), t("y9", "yellow", 9), t("r9", "red", 9), t("u9", "blue", 9), t("b-y", "blue", 2)];
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    const d = applyAction(s, "b", { type: "drawDiscard" }).state;
    const r = applyAction(d, "b", { type: "open", groups: [["k11", "k12", "k13"], ["y9", "r9", "u9"]], goingPairs: false });
    expect(r.ok).toBe(true);
    expect(r.state.players[1].opened).toBe(true);
    expect(r.state.players[0].score).toBe(120);
    expect(r.state.events.some((e) => e.text.includes("A ceza: +120"))).toBe(true);
  });

  it("yerden alınan taş geri bırakılırsa ceza yok", () => {
    const s = setup();
    s.players[0].discard = [t("k12", "black", 12)];
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    const d = applyAction(s, "b", { type: "drawDiscard" }).state;
    const r = applyAction(d, "b", { type: "returnDiscard" });
    expect(r.ok).toBe(true);
    expect(r.state.players.map((p) => p.score)).toEqual([0, 0, 0, 0]);
  });

  it("işlenen okey temsil ettiği değerle cezalanır", () => {
    const s = setup();
    s.players[1].opened = true;
    s.players[1].hand.push(t("w", "red", 4, "wildOkey"));
    s.tableMelds = [meldOf("c")];
    const r = applyAction(s, "b", { type: "process", tileId: "w", meldId: "m1", place: "right" });
    expect(r.ok).toBe(true);
    const as = r.state.tableMelds[0].okeyAs["w"].value;
    expect(r.state.players[2].score).toBe(as * 10);
    expect(as).toBeGreaterThan(0);
  });

  it("alınan taş başkasının perine işlenirse iki ceza da uygulanır", () => {
    const s = setup();
    s.players[1].opened = true;
    s.players[0].discard = [t("r4", "red", 4)];
    s.tableMelds = [meldOf("a")];
    s.turn = { hasDrawn: false, mustUseTileId: null, tookDiscard: false };
    const d = applyAction(s, "b", { type: "drawDiscard" }).state;
    const r = applyAction(d, "b", { type: "process", tileId: "r4", meldId: "m1", place: "right" });
    expect(r.ok).toBe(true);
    expect(r.state.players[0].score).toBe(80);
  });
});
