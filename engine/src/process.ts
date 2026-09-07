import { COLORS, type TableMeld, type Tile, type TileColor } from "./types.js";

export type AttachPlace = "left" | "right" | "append" | "swapOkey";

function missingSetColors(meld: TableMeld): TileColor[] {
  const used = new Set(
    meld.tiles.map((t) => (t.kind === "wildOkey" ? meld.okeyAs[t.id]?.color : t.color)),
  );
  return COLORS.filter((c) => !used.has(c));
}

export function canSwapOkey(meld: TableMeld, tile: Tile): boolean {
  if (tile.kind === "wildOkey") return false;
  return meld.tiles.some((t) => {
    if (t.kind !== "wildOkey") return false;
    const sub = meld.okeyAs[t.id];
    return sub && sub.color === tile.color && sub.value === tile.value;
  });
}

export function canAttach(
  meld: TableMeld,
  tile: Tile,
): Exclude<AttachPlace, "swapOkey">[] {
  const places: Exclude<AttachPlace, "swapOkey">[] = [];
  if (meld.type === "pair") return places;

  if (meld.type === "set") {
    if (meld.tiles.length >= 4) return places;
    const missing = missingSetColors(meld);
    if (tile.kind === "wildOkey" && missing.length > 0) {
      places.push("append");
      return places;
    }
    if (tile.kind !== "wildOkey" && tile.value === meld.setValue && missing.includes(tile.color)) {
      places.push("append");
    }
    return places;
  }

  const values = meld.values ?? [];
  const color = meld.color;
  if (!values.length || !color) return places;

  const leftVal = values[0];
  const rightVal = values[values.length - 1];

  const matches = (expectedColor: TileColor, expectedValue: number) => {
    if (tile.kind === "wildOkey") return true;
    return tile.color === expectedColor && tile.value === expectedValue;
  };

  if (meld.wrap) {
    if (leftVal > 2 && matches(color, leftVal - 1)) places.push("left");
  } else if (leftVal > 1 && matches(color, leftVal - 1)) {
    places.push("left");
  }

  if (meld.wrap) {
    // wrap serinin sağı 1 ile biter, devam yok
  } else if (rightVal < 13 && matches(color, rightVal + 1)) {
    places.push("right");
  } else if (rightVal === 13 && matches(color, 1)) {
    places.push("right");
  }

  return places;
}

export function isPlayableOnTable(melds: TableMeld[], tile: Tile): boolean {
  if (tile.kind === "wildOkey") {
    return melds.some((m) => m.type !== "pair" && canAttach(m, tile).length > 0);
  }
  return melds.some((m) => canAttach(m, tile).length > 0);
}

export function applyAttach(
  meld: TableMeld,
  tile: Tile,
  place: AttachPlace,
): { ok: true; meld: TableMeld; returned?: Tile } | { ok: false; error: string } {
  if (place === "swapOkey") {
    const idx = meld.tiles.findIndex((t) => {
      if (t.kind !== "wildOkey") return false;
      const sub = meld.okeyAs[t.id];
      return sub && sub.color === tile.color && sub.value === tile.value;
    });
    if (idx < 0) return { ok: false, error: "Bu okeyin yerine geçtiği gerçek taş elinde yok." };
    const wild = meld.tiles[idx];
    const nextTiles = [...meld.tiles];
    nextTiles[idx] = tile;
    const okeyAs = { ...meld.okeyAs };
    delete okeyAs[wild.id];
    return {
      ok: true,
      meld: { ...meld, tiles: nextTiles, okeyAs },
      returned: wild,
    };
  }

  const allowed = canAttach(meld, tile);
  if (!allowed.includes(place as "left" | "right" | "append")) {
    return { ok: false, error: "Bu taş o pere işlenemez." };
  }

  if (meld.type === "set" && place === "append") {
    const missing = missingSetColors(meld);
    const okeyAs = { ...meld.okeyAs };
    if (tile.kind === "wildOkey") {
      okeyAs[tile.id] = { color: missing[0], value: meld.setValue! };
    }
    return { ok: true, meld: { ...meld, tiles: [...meld.tiles, tile], okeyAs } };
  }

  const values = [...(meld.values ?? [])];
  const okeyAs = { ...meld.okeyAs };
  let wrap = meld.wrap ?? false;

  if (place === "left") {
    const v = values[0] - 1;
    values.unshift(v);
    if (tile.kind === "wildOkey") okeyAs[tile.id] = { color: meld.color!, value: v };
    return {
      ok: true,
      meld: { ...meld, tiles: [tile, ...meld.tiles], values, okeyAs, wrap },
    };
  }

  if (place === "right") {
    let v = values[values.length - 1] + 1;
    if (v === 14) {
      v = 1;
      wrap = true;
    }
    values.push(v);
    if (tile.kind === "wildOkey") okeyAs[tile.id] = { color: meld.color!, value: v };
    return {
      ok: true,
      meld: { ...meld, tiles: [...meld.tiles, tile], values, okeyAs, wrap },
    };
  }

  return { ok: false, error: "Geçersiz işleme." };
}
