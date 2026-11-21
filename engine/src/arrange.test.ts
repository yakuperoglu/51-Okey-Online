import { describe, expect, it } from "vitest";
import { arrangeHand, bestSeriesArrangement } from "./arrange.js";
import { validateMeld } from "./melds.js";
import type { Tile } from "./types.js";

function t(id: string, color: Tile["color"], value: number, kind: Tile["kind"] = "normal"): Tile {
  return { id, color, value, kind };
}
const wild = (id: string): Tile => t(id, "red", 5, "wildOkey");

function checkGroups(hand: Tile[], groups: string[][], pairs: boolean) {
  const seen = new Set<string>();
  for (const g of groups) {
    const tiles = g.map((id) => {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      return hand.find((h) => h.id === id)!;
    });
    expect(validateMeld(tiles, pairs).ok).toBe(true);
  }
}

describe("arrangeHand series", () => {
  it("seri ve eşli peri bulur, artanı sıralı döner", () => {
    const hand = [
      t("y10", "yellow", 10),
      t("y11", "yellow", 11),
      t("y12", "yellow", 12),
      t("r8", "red", 8),
      t("k8", "black", 8),
      t("b8", "blue", 8),
      t("r2", "red", 2),
      t("b13", "blue", 13),
      t("y1", "yellow", 1),
    ];
    const r = arrangeHand(hand, "series");
    expect(r.groups).toHaveLength(2);
    checkGroups(hand, r.groups, false);
    expect(r.rest).toEqual(["y1", "r2", "b13"]);
  });

  it("okeyi akıllı kullanır: 10-okey-12 + 8-8-8 = 57", () => {
    const hand = [t("y10", "yellow", 10), wild("w"), t("y12", "yellow", 12), t("r8", "red", 8), t("k8", "black", 8), t("b8", "blue", 8)];
    const r = bestSeriesArrangement(hand)!;
    expect(r.points).toBe(57);
    checkGroups(hand, r.groups, false);
    expect(r.rest).toEqual([]);
  });

  it("aynı taşın iki kopyasını iki ayrı pere dağıtır", () => {
    const hand = [
      t("a0", "red", 3), t("a1", "red", 4), t("a2", "red", 5),
      t("b0", "red", 3), t("b1", "red", 4), t("b2", "red", 5),
    ];
    const r = arrangeHand(hand, "series");
    expect(r.groups).toHaveLength(2);
    expect(r.rest).toEqual([]);
  });

  it("12-13-1 geçerli, 13-1-2 kurulmaz", () => {
    const ok = [t("a", "red", 12), t("b", "red", 13), t("c", "red", 1)];
    expect(arrangeHand(ok, "series").groups).toHaveLength(1);
    const bad = [t("a", "red", 13), t("b", "red", 1), t("c", "red", 2)];
    expect(arrangeHand(bad, "series").groups).toHaveLength(0);
  });

  it("per yoksa hepsi rest", () => {
    const hand = [t("a", "red", 1), t("b", "blue", 5), t("c", "black", 9)];
    const r = arrangeHand(hand, "series");
    expect(r.groups).toEqual([]);
    expect(r.rest).toHaveLength(3);
  });

  it("15 taşlık el 20 ms altında çözülür", () => {
    const hand: Tile[] = [];
    let n = 0;
    for (const c of ["yellow", "red", "black", "blue"] as const) {
      for (let v = 1; v <= 4 && hand.length < 13; v++) hand.push(t(`x${n++}`, c, v + (n % 3)));
    }
    hand.push(wild("w1"), wild("w2"));
    const start = performance.now();
    const r = arrangeHand(hand.slice(0, 15), "series");
    expect(performance.now() - start).toBeLessThan(20);
    checkGroups(hand, r.groups, false);
  });
});

describe("arrangeHand pairs", () => {
  it("özdeş taşları çift yapar, okey tek taşı tamamlar", () => {
    const hand = [
      t("a0", "red", 3), t("a1", "red", 3),
      t("b0", "blue", 9), t("b1", "blue", 9),
      t("c", "black", 4), wild("w"), t("d", "yellow", 2),
    ];
    const r = arrangeHand(hand, "pairs");
    expect(r.groups).toHaveLength(3);
    checkGroups(hand, r.groups, true);
    expect(r.rest).toEqual(["d"]);
  });
});
