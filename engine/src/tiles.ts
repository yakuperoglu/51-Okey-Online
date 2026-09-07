import { COLORS, type OkeyIdentity, type Tile, type TileColor } from "./types.js";

export function createDeck(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of COLORS) {
    for (let value = 1; value <= 13; value++) {
      for (const copy of [0, 1]) {
        tiles.push({
          id: `${color}-${value}-${copy}`,
          color,
          value,
          kind: "normal",
        });
      }
    }
  }
  tiles.push({
    id: "fake-0",
    color: "yellow",
    value: 0,
    kind: "fakeOkey",
    wasFakeOkey: true,
  });
  tiles.push({
    id: "fake-1",
    color: "yellow",
    value: 0,
    kind: "fakeOkey",
    wasFakeOkey: true,
  });
  return tiles;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function okeyFromIndicator(indicator: Tile): OkeyIdentity {
  return {
    color: indicator.color,
    value: indicator.value === 13 ? 1 : indicator.value + 1,
  };
}

export function applyOkeyTransform(tiles: Tile[], okey: OkeyIdentity): Tile[] {
  return tiles.map((tile) => transformTile(tile, okey));
}

export function transformTile(tile: Tile, okey: OkeyIdentity): Tile {
  if (tile.kind === "fakeOkey" || tile.wasFakeOkey) {
    return {
      ...tile,
      color: okey.color,
      value: okey.value,
      kind: "normal",
      wasFakeOkey: true,
    };
  }
  if (tile.color === okey.color && tile.value === okey.value) {
    return { ...tile, kind: "wildOkey" };
  }
  return { ...tile, kind: "normal" };
}

export function leftoverValue(tile: Tile): number {
  if (tile.kind === "wildOkey") return 25;
  return tile.value;
}

export function describeTile(tile: Tile): string {
  if (tile.kind === "wildOkey") return "Okey";
  const names: Record<TileColor, string> = {
    yellow: "Sarı",
    red: "Kırmızı",
    black: "Siyah",
    blue: "Mavi",
  };
  return `${names[tile.color]} ${tile.value}`;
}

export function cloneTile(tile: Tile): Tile {
  return { ...tile };
}
