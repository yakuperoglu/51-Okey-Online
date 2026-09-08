import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  canAttach,
  canSwapOkey,
  COLOR_TR,
  openingHint,
  validateMeld,
  type ClientGameState,
  type GameAction,
  type PublicPlayer,
  type TableMeld,
  type Tile,
} from "@okey/engine";
import { Istaka } from "./Istaka";
import { scoreRack } from "./rackScore";
import { TileBack, TileView } from "./Tile";
import { AvatarView } from "./Avatar";

const POS = ["bottom", "right", "top", "left"] as const;

type FlyChip = {
  id: string;
  fromId: string;
  kind: "open" | "process";
};

function rel(index: number, you: number) {
  return (index - you + 4) % 4;
}

function pad3(n: number) {
  return String(Math.max(0, n)).padStart(3, "0");
}

function MeldView({
  meld,
  highlight,
  arriving,
  arrivingTiles,
  onClick,
}: {
  meld: TableMeld;
  highlight?: boolean;
  arriving?: boolean;
  arrivingTiles?: Set<string>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`meld ${meld.type} ${highlight ? "hot" : ""} ${arriving ? "arrive" : ""}`}
      style={
        meld.type === "set"
          ? { gridRow: `span ${meld.tiles.length}` }
          : { gridColumn: `span ${meld.tiles.length}` }
      }
      onClick={onClick}
      disabled={!onClick}
    >
      {meld.tiles.map((t) => {
        const who = meld.addedBy?.[t.id];
        const processed = Boolean(who && who !== meld.ownerId);
        const justIn = arrivingTiles?.has(t.id);
        return (
          <span
            key={t.id}
            className={`meld-tile-wrap ${processed ? "processed" : ""} ${justIn ? "tile-arrive" : ""}`}
          >
            <TileView tile={t} board small />
          </span>
        );
      })}
    </button>
  );
}

function Plate({
  player,
  pos,
  avatar,
  active,
  acting,
}: {
  player: PublicPlayer;
  pos: (typeof POS)[number];
  avatar: ReactNode;
  active?: boolean;
  acting?: boolean;
}) {
  return (
    <div className={`plate ${pos} ${active ? "active" : ""} ${acting ? "acting" : ""}`}>
      <span className="avatar">{avatar}</span>
      <div className="plate-text">
        <strong>{player.name}</strong>
        <em>{player.score}</em>
      </div>
    </div>
  );
}

export function Table({
  state,
  isHost,
  onAction,
  onLeave,
  flash,
}: {
  state: ClientGameState;
  isHost: boolean;
  onAction: (action: GameAction) => void;
  onLeave: () => void;
  flash: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[][]>([]);
  const [sheet, setSheet] = useState(false);
  const [rackSlots, setRackSlots] = useState<(string | null)[]>([]);
  const [overDiscard, setOverDiscard] = useState(false);
  const [flying, setFlying] = useState<FlyChip[]>([]);
  const [arriveMelds, setArriveMelds] = useState<Set<string>>(new Set());
  const [arriveTiles, setArriveTiles] = useState<Set<string>>(new Set());
  const [actingId, setActingId] = useState<string | null>(null);
  const prevMelds = useRef<TableMeld[] | null>(null);
  const onRackLayout = useCallback((slots: (string | null)[]) => setRackSlots(slots), []);

  const you = state.yourIndex;
  const needDraw = state.isYourTurn && !state.turn.hasDrawn;
  const prevIndex = (you + 3) % 4;
  const youPlayer = state.players[you];

  const selectedTiles = useMemo(
    () => selected.map((id) => state.yourHand.find((t) => t.id === id)).filter(Boolean) as Tile[],
    [selected, state.yourHand],
  );

  const preview = selectedTiles.length >= 2 ? validateMeld(selectedTiles, false) : null;
  const pairPreview = selectedTiles.length === 2 ? validateMeld(selectedTiles, true) : null;
  const grouped = useMemo(() => new Set(groups.flat()), [groups]);
  const pendingPoints = groups.reduce((sum, g) => {
    const tiles = g.map((id) => state.yourHand.find((t) => t.id === id)).filter(Boolean) as Tile[];
    const v = validateMeld(tiles, false);
    return sum + (v.ok ? v.meld.points : 0);
  }, preview?.ok ? preview.meld.points : 0);

  const rackScore = useMemo(() => scoreRack(rackSlots, state.yourHand), [rackSlots, state.yourHand]);
  const okeyTile: Tile = {
    id: "okey-face",
    color: state.okey.color,
    value: state.okey.value,
    kind: "normal",
  };
  const canDiscard = state.isYourTurn && !needDraw && state.phase === "playing";
  const myDiscard = youPlayer?.discard[youPlayer.discard.length - 1];
  const openingGroups = groups.length
    ? groups
    : rackScore.groups.length
      ? rackScore.groups
      : selected.length >= 3
        ? [selected]
        : [];
  const openingPoints = groups.length ? pendingPoints : rackScore.points;
  const canOpen51 = openingGroups.length > 0 && (Boolean(youPlayer?.opened) || openingPoints >= 51);

  const processTargets = useMemo(() => {
    if (selected.length !== 1) return new Set<string>();
    const tile = state.yourHand.find((t) => t.id === selected[0]);
    if (!tile || !youPlayer?.opened) return new Set<string>();
    const ids = new Set<string>();
    for (const meld of state.tableMelds) {
      if (canSwapOkey(meld, tile) || canAttach(meld, tile).length) ids.add(meld.id);
    }
    return ids;
  }, [selected, state.yourHand, state.tableMelds, youPlayer?.opened]);

  const meldsByOwner = useMemo(() => {
    const map = new Map<string, TableMeld[]>();
    for (const m of state.tableMelds) {
      const list = map.get(m.ownerId) ?? [];
      list.push(m);
      map.set(m.ownerId, list);
    }
    return map;
  }, [state.tableMelds]);

  useEffect(() => {
    const prev = prevMelds.current;
    prevMelds.current = state.tableMelds;
    if (!prev) return;

    const chips: FlyChip[] = [];
    const newMelds = new Set<string>();
    const newTiles = new Set<string>();
    let actor: string | null = null;
    const oldMap = new Map(prev.map((m) => [m.id, m]));
    const chipOnce = new Set<string>();

    for (const meld of state.tableMelds) {
      const old = oldMap.get(meld.id);
      if (!old) {
        newMelds.add(meld.id);
        actor = meld.ownerId;
        const key = `open-${meld.ownerId}`;
        if (!chipOnce.has(key)) {
          chipOnce.add(key);
          chips.push({ id: `${key}-${meld.id}`, fromId: meld.ownerId, kind: "open" });
        }
        continue;
      }
      for (const tile of meld.tiles) {
        if (old.tiles.some((t) => t.id === tile.id)) continue;
        newTiles.add(tile.id);
        const who = meld.addedBy?.[tile.id] ?? meld.ownerId;
        actor = who;
        const key = `process-${who}`;
        if (!chipOnce.has(key)) {
          chipOnce.add(key);
          chips.push({ id: `${key}-${tile.id}`, fromId: who, kind: "process" });
        }
      }
    }

    if (!chips.length) return;
    setFlying((f) => [...f, ...chips]);
    setArriveMelds((s) => new Set([...s, ...newMelds]));
    setArriveTiles((s) => new Set([...s, ...newTiles]));
    setActingId(actor);
    const chipIds = chips.map((c) => c.id);
    window.setTimeout(() => {
      setFlying((f) => f.filter((c) => !chipIds.includes(c.id)));
      setArriveMelds((s) => {
        const n = new Set(s);
        newMelds.forEach((id) => n.delete(id));
        return n;
      });
      setArriveTiles((s) => {
        const n = new Set(s);
        newTiles.forEach((id) => n.delete(id));
        return n;
      });
      setActingId((cur) => (cur === actor ? null : cur));
    }, 900);
  }, [state.tableMelds]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function addGroup() {
    if (selected.length < 2) return;
    setGroups((g) => [...g, selected]);
    setSelected([]);
  }

  function open(goingPairs: boolean) {
    const payload = goingPairs
      ? groups.length
        ? groups
        : selected.length === 2
          ? [selected]
          : []
      : openingGroups;
    if (!payload.length) return;
    onAction({ type: "open", groups: payload, goingPairs });
    setGroups([]);
    setSelected([]);
  }

  function discardTile(tileId: string) {
    if (!canDiscard) return;
    onAction({ type: "discard", tileId });
    setSelected([]);
  }

  function process(meld: TableMeld) {
    if (selected.length !== 1) return;
    const tile = state.yourHand.find((t) => t.id === selected[0]);
    if (!tile) return;
    if (canSwapOkey(meld, tile)) {
      onAction({ type: "process", tileId: tile.id, meldId: meld.id, place: "swapOkey" });
    } else {
      const place = canAttach(meld, tile)[0];
      if (!place) return;
      onAction({ type: "process", tileId: tile.id, meldId: meld.id, place });
    }
    setSelected([]);
  }

  function hint() {
    const h = openingHint(state.yourHand, state.config.minPairs);
    if (!h) return;
    setGroups(h.groups);
    setSelected([]);
  }

  const currentName = state.players[state.currentIndex]?.name ?? "";

  return (
    <div className="play okey-table">
      <div className="landscape-gate" aria-hidden>
        <span className="phone-tilt" />
        <p>Telefonu yan çevir</p>
        <small>Oyun yatay oynanır</small>
      </div>

      <div className="arena">
        <button type="button" className="hud-x" onClick={onLeave} aria-label="Çık">
          ×
        </button>
        <span className="hud-round">
          {state.round}. El
        </span>
        <button type="button" className="hud-score" onClick={() => setSheet(true)} aria-label="Skor">
          ✎
        </button>

        {state.players.map((p, i) => {
          const pos = POS[rel(i, you)];
          if (pos === "bottom") return null;
          const last = p.discard[p.discard.length - 1];
          return (
            <div key={p.id} className={`seat ${pos} ${i === state.currentIndex ? "turn" : ""} ${actingId === p.id ? "acting" : ""}`}>
              <Plate
                player={p}
                pos={pos}
                avatar={<AvatarView id={p.avatarId} size="sm" />}
                active={i === state.currentIndex}
                acting={actingId === p.id}
              />
              {last ? (
                <div className="discard-slot">
                  <TileView
                    tile={last}
                    onClick={needDraw && i === prevIndex ? () => onAction({ type: "drawDiscard" }) : undefined}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <section className="board">
          {state.players.map((p, i) => {
            const pos = POS[rel(i, you)];
            const mine = p.id === youPlayer?.id;
            const melds = meldsByOwner.get(p.id) ?? [];
            return (
              <div key={p.id} className={`board-zone ${pos} ${mine ? "mine" : ""} ${melds.length ? "has-melds" : ""}`}>
                <div className="zone-melds">
                  {melds.map((m) => (
                    <MeldView
                      key={m.id}
                      meld={m}
                      arriving={arriveMelds.has(m.id)}
                      arrivingTiles={arriveTiles}
                      highlight={processTargets.has(m.id)}
                      onClick={processTargets.has(m.id) ? () => process(m) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {flying.map((f) => {
          const idx = state.players.findIndex((p) => p.id === f.fromId);
          const pos = idx >= 0 ? POS[rel(idx, you)] : "bottom";
          const who = state.players[idx];
          return (
            <div key={f.id} className={`fly-chip from-${pos}`}>
              <AvatarView id={who?.avatarId} size="sm" />
              <b>{who?.id === youPlayer?.id ? "siz" : who?.name}</b>
              <span>{f.kind === "open" ? "açtı" : "işledi"}</span>
            </div>
          );
        })}

        <div className="center-well">
          <div className="okey-show" title={`Okey: ${COLOR_TR[state.okey.color]} ${state.okey.value}`}>
            <TileView tile={okeyTile} />
            <b className="well-label">Okey</b>
          </div>
          <div className="draw-well">
            <TileBack onClick={needDraw ? () => onAction({ type: "drawPile" }) : undefined} />
            <b className="well-label">{pad3(state.drawPileCount)}</b>
          </div>
        </div>

        <div
          className={`discard-well ${overDiscard ? "hot" : ""} ${canDiscard ? "open" : ""}`}
          data-discard-drop
          title="Taşı buraya bırakarak at"
        >
          {myDiscard ? <TileView tile={myDiscard} /> : <em className="well-label">At</em>}
        </div>

        {state.phase === "roundEnd" ? (
          <div className="round-end">
            <h3>El bitti</h3>
            {state.finish ? (
              <p>
                {state.players.find((p) => p.id === state.finish?.winnerId)?.name} kazandı
                {state.finish.withOkey ? " · kanlı" : ""}
                {state.finish.withPairs ? " · çift" : ""} ({state.finish.winnerDelta})
              </p>
            ) : (
              <p>Taşlar bitti.</p>
            )}
            {isHost ? (
              <button type="button" className="primary" onClick={() => onAction({ type: "nextRound" })}>
                Sonraki el
              </button>
            ) : (
              <p className="muted">Oda sahibi yeni eli başlatacak.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="fab-bar">
        <div className={`hud-points ${rackScore.points >= 51 ? "ready" : ""}`} title="Istaka per puanı">
          {pad3(rackScore.points)}
        </div>
        <span className="fab-status">
          {state.isYourTurn
            ? needDraw
              ? "Taş çek"
              : "Per aç veya at"
            : `Sıra: ${currentName}`}
          {flash ? <em> {flash}</em> : null}
        </span>
        <button type="button" onClick={addGroup} disabled={selected.length < 2}>
          Grup
        </button>
        <button type="button" onClick={() => open(false)} disabled={!canOpen51}>
          51 aç
        </button>
        <button type="button" onClick={() => open(true)} disabled={!groups.length && selected.length !== 2}>
          Çifte
        </button>
        <button
          type="button"
          className="danger"
          disabled={!canDiscard || selected.length !== 1}
          onClick={() => discardTile(selected[0])}
        >
          At
        </button>
        <button type="button" className="ghost" onClick={hint}>
          ?
        </button>
        {pairPreview?.ok || preview?.ok ? <b>{preview?.ok ? `${preview.meld.points}` : "çift"}</b> : null}
      </div>

      {groups.length ? (
        <div className="pending">
          {groups.map((g, i) => (
            <div key={i} className="pending-group">
              {g.map((id) => {
                const tile = state.yourHand.find((t) => t.id === id);
                return tile ? <TileView key={id} tile={tile} board small /> : null;
              })}
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => setGroups([])}>
            Sil
          </button>
        </div>
      ) : null}

      <Istaka
        key={state.round}
        dealKey={`${state.round}-${state.indicator.id}`}
        tiles={state.yourHand}
        selected={selected}
        grouped={grouped}
        scored={rackScore.ids}
        onToggle={toggle}
        canDiscard={canDiscard}
        onDiscard={discardTile}
        onHoverDiscard={setOverDiscard}
        onLayout={onRackLayout}
      />

      {sheet ? (
        <div className="sheet" onClick={() => setSheet(false)}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <h3>Skorlar</h3>
            <ol className="scores">
              {state.players.map((p, i) => (
                <li key={p.id} className={i === state.currentIndex ? "turn" : ""}>
                  <b>{p.name}</b>
                  <span>
                    {p.score} · {p.tileCount} taş
                    {p.opened ? (p.goingPairs ? " · çift" : " · açık") : ""}
                  </span>
                </li>
              ))}
            </ol>
            <ul className="log">
              {state.events.map((e) => (
                <li key={e.id} className={e.kind}>
                  {e.text}
                </li>
              ))}
            </ul>
            <button type="button" className="primary" onClick={() => setSheet(false)}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
