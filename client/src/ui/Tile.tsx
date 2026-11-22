import type { PointerEvent } from "react";
import type { OkeyIdentity, Tile } from "@okey/engine";

const COLOR_CLASS: Record<Tile["color"], string> = {
  yellow: "c-yellow",
  red: "c-red",
  black: "c-black",
  blue: "c-blue",
};

const HEART = "M12 21S3.2 15.2 1.6 9.7C.4 5.7 3.4 3 6.8 3c2.1 0 3.6 1.1 5.2 3.2C13.6 4.1 15.1 3 17.2 3c3.4 0 6.4 2.7 5.2 6.7C20.8 15.2 12 21 12 21z";
const STAR = "M12 1.8l2.9 6.7 7.3.7-5.5 4.8 1.6 7.1L12 17.4l-6.3 3.7 1.6-7.1L1.8 9.2l7.3-.7z";

export function TileView({
  tile: rawTile,
  selected,
  dim,
  onClick,
  small,
  rack,
  board,
  concealAs,
}: {
  tile: Tile;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  small?: boolean;
  rack?: boolean;
  board?: boolean;
  /** Show a real okey as its natural face (no star) - the player has to recognise it themselves. */
  concealAs?: OkeyIdentity;
}) {
  const tile: Tile =
    concealAs && rawTile.kind === "wildOkey"
      ? { ...rawTile, color: concealAs.color, value: concealAs.value, kind: "normal" }
      : rawTile;
  const wild = tile.kind === "wildOkey";
  const fake = tile.kind === "fakeOkey" || Boolean(tile.wasFakeOkey);
  const className = [
    "tile",
    COLOR_CLASS[tile.color],
    wild ? "wild" : "",
    fake && !wild ? "fake" : "",
    selected ? "selected" : "",
    dim ? "dim" : "",
    small ? "small" : "",
    rack ? "rack" : "",
    board ? "board-tile" : "",
    onClick ? "clickable" : "",
  ].join(" ");

  const face = (
    <span className="tile-face">
      {wild ? (
        <svg className="joker-star" viewBox="0 0 24 24" aria-hidden>
          <path d={STAR} />
        </svg>
      ) : (
        <span className="num">{tile.value}</span>
      )}
      <span className="suit-well" aria-hidden>
        <svg className="suit" viewBox="0 0 24 24">
          {fake && !wild ? <circle cx="12" cy="12" r="7" /> : <path d={wild ? STAR : HEART} />}
        </svg>
      </span>
    </span>
  );
  const title = fake && !wild ? "Sahte okey" : `${tile.value}`;

  if (rack || !onClick) {
    return (
      <div className={className} title={title}>
        {face}
      </div>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {face}
    </button>
  );
}

export function TileBack({
  onClick,
  onPointerDown,
  count,
}: {
  onClick?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  count?: number;
}) {
  return (
    <button type="button" className={`tile back ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={!onClick}
    >
      <span className="tile-face">
        <span className="back-mark" />
      </span>
      {typeof count === "number" ? <span className="back-label">{count}</span> : null}
    </button>
  );
}
