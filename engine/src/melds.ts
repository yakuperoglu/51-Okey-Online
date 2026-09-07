import { COLORS, type Tile, type TileColor, type ValidatedMeld } from "./types.js";

function invalid(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function okeyAsFrom(tiles: Tile[], values: number[], color: TileColor) {
  const okeyAs: ValidatedMeld["okeyAs"] = {};
  tiles.forEach((tile, i) => {
    if (tile.kind === "wildOkey") {
      okeyAs[tile.id] = { color, value: values[i] };
    }
  });
  return okeyAs;
}

export function validateSeries(tiles: Tile[]): { ok: true; meld: ValidatedMeld } | { ok: false; error: string } {
  if (tiles.length < 3) return invalid("Seri per en az 3 taş olmalı.");

  const normals = tiles.filter((t) => t.kind !== "wildOkey");
  if (normals.length === 0) return invalid("Seri en az bir normal taş içermeli.");

  const color = normals[0].color;
  if (normals.some((t) => t.color !== color)) {
    return invalid("Seri per aynı renkte olmalı.");
  }

  let best: { values: number[]; wrap: boolean; points: number } | null = null;
  const n = tiles.length;

  for (const wrap of [false, true]) {
    for (let start = 1; start <= 13; start++) {
      const values: number[] = [];
      let ok = true;
      for (let i = 0; i < n; i++) {
        let v: number;
        if (!wrap) {
          v = start + i;
          if (v < 1 || v > 13) {
            ok = false;
            break;
          }
        } else {
          v = start + i;
          if (v === 14) v = 1;
          else if (v > 14) {
            ok = false;
            break;
          }
        }
        const tile = tiles[i];
        if (tile.kind !== "wildOkey" && tile.value !== v) {
          ok = false;
          break;
        }
        values.push(v);
      }
      if (!ok) continue;
      if (wrap && !(values.includes(13) && values[values.length - 1] === 1 && values.includes(1))) {
        continue;
      }
      if (wrap && values.filter((v) => v === 1).length !== 1) continue;
      const points = values.reduce((a, b) => a + b, 0);
      if (!best || points > best.points) best = { values, wrap, points };
    }
  }

  if (!best) return invalid("Geçersiz seri dizilimi. 12-13-1 geçerli, 12-13-1-2 geçersizdir.");

  return {
    ok: true,
    meld: {
      type: "series",
      tiles,
      points: best.points,
      color,
      values: best.values,
      wrap: best.wrap,
      okeyAs: okeyAsFrom(tiles, best.values, color),
    },
  };
}

export function validateSet(tiles: Tile[]): { ok: true; meld: ValidatedMeld } | { ok: false; error: string } {
  if (tiles.length < 3 || tiles.length > 4) {
    return invalid("Eşli per 3 veya 4 taş olmalı.");
  }

  const normals = tiles.filter((t) => t.kind !== "wildOkey");
  if (normals.length === 0) return invalid("Eşli per en az bir normal taş içermeli.");

  const value = normals[0].value;
  if (normals.some((t) => t.value !== value)) {
    return invalid("Eşli per aynı sayıda olmalı.");
  }

  const used = new Set<TileColor>();
  const okeyAs: ValidatedMeld["okeyAs"] = {};
  const missing = COLORS.filter((c) => !normals.some((t) => t.color === c));

  for (const tile of tiles) {
    if (tile.kind === "wildOkey") {
      const color = missing.shift();
      if (!color) return invalid("Eşli perde fazla okey var.");
      if (used.has(color)) return invalid("Eşli perde aynı renk tekrar edemez.");
      used.add(color);
      okeyAs[tile.id] = { color, value };
    } else {
      if (used.has(tile.color)) return invalid("Eşli perde aynı renk tekrar edemez.");
      used.add(tile.color);
    }
  }

  return {
    ok: true,
    meld: {
      type: "set",
      tiles,
      points: value * tiles.length,
      setValue: value,
      okeyAs,
    },
  };
}

export function validatePair(tiles: Tile[]): { ok: true; meld: ValidatedMeld } | { ok: false; error: string } {
  if (tiles.length !== 2) return invalid("Çift tam 2 taş olmalı.");
  const [a, b] = tiles;

  if (a.kind === "wildOkey" && b.kind === "wildOkey") {
    return {
      ok: true,
      meld: {
        type: "pair",
        tiles,
        points: 0,
        okeyAs: {
          [a.id]: { color: "yellow", value: 1 },
          [b.id]: { color: "yellow", value: 1 },
        },
      },
    };
  }

  if (a.kind === "wildOkey") {
    return {
      ok: true,
      meld: {
        type: "pair",
        tiles,
        points: b.value * 2,
        color: b.color,
        okeyAs: { [a.id]: { color: b.color, value: b.value } },
      },
    };
  }

  if (b.kind === "wildOkey") {
    return {
      ok: true,
      meld: {
        type: "pair",
        tiles,
        points: a.value * 2,
        color: a.color,
        okeyAs: { [b.id]: { color: a.color, value: a.value } },
      },
    };
  }

  if (a.color !== b.color || a.value !== b.value) {
    return invalid("Çift aynı renk ve aynı sayıda iki taş olmalı.");
  }

  return {
    ok: true,
    meld: {
      type: "pair",
      tiles,
      points: a.value * 2,
      color: a.color,
      okeyAs: {},
    },
  };
}

export function validateMeld(
  tiles: Tile[],
  goingPairs: boolean,
): { ok: true; meld: ValidatedMeld } | { ok: false; error: string } {
  if (goingPairs) return validatePair(tiles);

  if (tiles.length === 2) {
    return invalid("Normal açılışta çift per kullanılamaz. Seri veya eşli per dizin.");
  }

  const asSet = validateSet(tiles);
  if (asSet.ok) return asSet;

  const asSeries = validateSeries(tiles);
  if (asSeries.ok) return asSeries;

  return invalid(asSet.error || asSeries.error || "Geçersiz per.");
}

export function tileFacePoints(tile: Tile, sub?: { value: number }): number {
  if (tile.kind === "wildOkey") return sub?.value ?? 0;
  return tile.value;
}
