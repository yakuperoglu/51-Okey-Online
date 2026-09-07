import type { Tile } from "@okey/engine";

const COLOR_CLASS: Record<Tile["color"], string> = {
  yellow: "c-yellow",
  red: "c-red",
  black: "c-black",
  blue: "c-blue",
};

export function TileView({
  tile,
  selected,
  dim,
  onClick,
  small,
  rack,
  board,
}: {
  tile: Tile;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  small?: boolean;
  rack?: boolean;
  board?: boolean;
}) {
  const wild = tile.kind === "wildOkey";
  const fake = Boolean(tile.wasFakeOkey);
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
      <span className="num">{wild ? tile.value || "O" : tile.value}</span>
      <span className="suit-well" aria-hidden>
        <svg className="suit" viewBox="0 0 24 24">
          <path d="M12 21S3.2 15.2 1.6 9.7C.4 5.7 3.4 3 6.8 3c2.1 0 3.6 1.1 5.2 3.2C13.6 4.1 15.1 3 17.2 3c3.4 0 6.4 2.7 5.2 6.7C20.8 15.2 12 21 12 21z" />
        </svg>
      </span>
    </span>
  );

  if (rack || !onClick) {
    return (
      <div className={className} title={wild ? "Okey" : `${tile.value}`}>
        {face}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      title={wild ? "Okey" : `${tile.value}`}
    >
      {face}
    </button>
  );
}

export function TileBack({ onClick, count }: { onClick?: () => void; count?: number }) {
  return (
    <button type="button" className={`tile back ${onClick ? "clickable" : ""}`} onClick={onClick} disabled={!onClick}>
      <span className="tile-face">
        <span className="back-mark" />
      </span>
      {typeof count === "number" ? <span className="back-label">{count}</span> : null}
    </button>
  );
}
