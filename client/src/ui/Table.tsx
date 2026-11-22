import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  arrangeHand,
  canAttach,
  canSwapOkey,
  openingHint,
  tileFacePoints,
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
import "./table.css";

/** Seat position by relative index: 0 = you, then counter-clockwise (next player is on your right). */
const ACCENT: Record<string, string> = {
  bottom: "#e8b93a",
  right: "#2fc4b2",
  top: "#a98af0",
  left: "#ff7a66",
};
const POS = ["bottom", "right", "top", "left"] as const;
type Pos = (typeof POS)[number];

type FlyChip = {
  id: string;
  fromId: string;
  kind: "open" | "process";
};

function rel(index: number, you: number) {
  return (index - you + 4) % 4;
}


function MeldView({
  meld,
  highlight,
  arriving,
  arrivingTiles,
  dotColor,
  onClick,
}: {
  meld: TableMeld;
  highlight?: boolean;
  arriving?: boolean;
  arrivingTiles?: Set<string>;
  dotColor?: (playerId: string) => string | undefined;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`meld ${meld.type} ${highlight ? "hot" : ""} ${arriving ? "arrive" : ""}`}
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
            style={processed && who ? ({ "--dot": dotColor?.(who) } as React.CSSProperties) : undefined}
          >
            <TileView tile={t} board small />
          </span>
        );
      })}
    </button>
  );
}

function Seat({
  player,
  pos,
  avatar,
  active,
  acting,
}: {
  player: PublicPlayer;
  pos: Pos;
  avatar: ReactNode;
  active?: boolean;
  acting?: boolean;
}) {
  return (
    <div style={{ "--acc": ACCENT[pos] } as React.CSSProperties} className={`seat ${pos} ${active ? "turn" : ""} ${acting ? "acting" : ""} ${player.connected ? "" : "offline"}`}>
      <div className="av">
        {avatar}
        {pos !== "bottom" ? <b className="count-badge" title="Eldeki taş">{player.tileCount}</b> : null}
      </div>
      <div className="seat-text">
        <strong title={player.name}>{pos === "bottom" || player.name.length <= 10 ? player.name : `${player.name.slice(0, 9)}…`}</strong>
        <em>{player.score}</em>
      </div>
    </div>
  );
}

function DiscardSpot({
  pos,
  owner,
  takeable,
  droppable,
  hot,
  onTake,
  onTap,
}: {
  pos: Pos;
  owner: PublicPlayer | undefined;
  takeable?: boolean;
  droppable?: boolean;
  hot?: boolean;
  onTake?: () => void;
  onTap?: () => void;
}) {
  const pile = owner?.discard ?? [];
  const last = pile[pile.length - 1];
  const under = pile[pile.length - 2];
  return (
    <div
      className={`discard-spot ${pos} ${takeable ? "takeable" : ""} ${droppable ? "droppable" : ""} ${hot ? "hot" : ""}`}
      {...(pos === "bottom" ? { "data-discard-drop": "" } : {})}
      title={pos === "bottom" ? "Taşı buraya bırakarak at" : undefined}
      onClick={onTap}
    >
      {under ? (
        <span className="under">
          <TileView tile={under} small />
        </span>
      ) : null}
      {last ? (
        <span className="top-tile">
          <TileView tile={last} onClick={takeable ? onTake : undefined} />
        </span>
      ) : (
        <em className="spot-empty">{pos === "bottom" ? "At" : ""}</em>
      )}
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
  const [arrange, setArrange] = useState<{ seq: number; groups: string[][]; rest: string[] } | null>(null);
  const prevMelds = useRef<TableMeld[] | null>(null);
  const baseScores = useRef<Map<string, number>>(new Map());
  const onRackLayout = useCallback((slots: (string | null)[]) => setRackSlots(slots), []);

  // Remember scores while the round is being played so the round-end modal can show deltas.
  if (state.phase === "playing") {
    baseScores.current = new Map(state.players.map((p) => [p.id, p.score]));
  }

  const you = state.yourIndex;
  const needDraw = state.isYourTurn && !state.turn.hasDrawn;
  const prevIndex = (you + 3) % 4;
  const youPlayer = state.players[you];
  const minPairs = state.config.minPairs;
  const assist = state.config.assist !== false;

  const selectedTiles = useMemo(
    () => selected.map((id) => state.yourHand.find((t) => t.id === id)).filter(Boolean) as Tile[],
    [selected, state.yourHand],
  );

  const preview = selectedTiles.length >= 2 ? validateMeld(selectedTiles, false) : null;
  const grouped = useMemo(() => new Set(groups.flat()), [groups]);
  const pendingPoints = groups.reduce((sum, g) => {
    const tiles = g.map((id) => state.yourHand.find((t) => t.id === id)).filter(Boolean) as Tile[];
    const v = validateMeld(tiles, false);
    return sum + (v.ok ? v.meld.points : 0);
  }, preview?.ok ? preview.meld.points : 0);

  const rackScore = useMemo(() => scoreRack(rackSlots, state.yourHand), [rackSlots, state.yourHand]);
  const canDiscard = state.isYourTurn && !needDraw && state.phase === "playing";

  // "El aç": contiguous blocks on the rack are melds (rackScore), manual groups / selection are the fallback.
  const openingGroups = groups.length
    ? groups
    : rackScore.groups.length
      ? rackScore.groups
      : selected.length >= 3
        ? [selected]
        : [];
  const openingPoints = groups.length ? pendingPoints : rackScore.points;
  const opened = Boolean(youPlayer?.opened);
  const canSeries = openingGroups.length > 0 && (opened || openingPoints >= 51);
  const pairGroups = rackScore.pairGroups;
  const canPairs = !opened && pairGroups.length >= minPairs;
  const useSeries = canSeries || !canPairs;
  const openLabel = !assist ? "El aç" : useSeries ? `El aç (${openingPoints})` : `El aç (${pairGroups.length} çift)`;
  const canOpenNow = canDiscard && (!assist || canSeries || canPairs);

  const processTargets = useMemo(() => {
    if (!assist || selected.length !== 1) return new Set<string>();
    const tile = state.yourHand.find((t) => t.id === selected[0]);
    if (!tile || !youPlayer?.opened) return new Set<string>();
    const ids = new Set<string>();
    for (const meld of state.tableMelds) {
      if (canSwapOkey(meld, tile) || canAttach(meld, tile).length) ids.add(meld.id);
    }
    return ids;
  }, [assist, selected, state.yourHand, state.tableMelds, youPlayer?.opened]);

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

  function openHand() {
    if (!canOpenNow) return;
    if (useSeries) {
      onAction({ type: "open", groups: openingGroups, goingPairs: false });
    } else {
      onAction({ type: "open", groups: pairGroups, goingPairs: true });
    }
    setGroups([]);
    setSelected([]);
  }

  function openPairs() {
    onAction({ type: "open", groups: pairGroups, goingPairs: true });
    setGroups([]);
    setSelected([]);
  }

  /** Legacy fallback: explicitly open the grouped / selected tiles as pairs. */
  function openPairsManual() {
    const payload = groups.length ? groups : selected.length === 2 ? [selected] : [];
    if (!payload.length) return;
    onAction({ type: "open", groups: payload, goingPairs: true });
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
    const h = openingHint(state.yourHand, minPairs);
    if (!h) return;
    setGroups(h.groups);
    setSelected([]);
  }

  function arrangeRack(mode: "series" | "pairs") {
    const result = arrangeHand(state.yourHand, mode);
    setGroups([]);
    setSelected([]);
    setArrange((a) => ({ seq: (a?.seq ?? 0) + 1, groups: result.groups, rest: result.rest }));
  }

  const dotColor = (playerId: string) => {
    const idx = state.players.findIndex((p) => p.id === playerId);
    return idx >= 0 ? ACCENT[POS[rel(idx, you)]] : undefined;
  };
  const currentName = state.players[state.currentIndex]?.name ?? "";
  const status = state.isYourTurn
    ? needDraw
      ? "Sıra sende: taş çek"
      : "Per aç veya taş at"
    : `Sıra: ${currentName}`;
  const kanli = state.config.ruleset === "kanli";
  const winner = state.finish ? state.players.find((p) => p.id === state.finish?.winnerId) : undefined;

  return (
    <div className="play okey-table">
      <div className="landscape-gate" aria-hidden>
        <span className="phone-tilt" />
        <p>Telefonu yan çevir</p>
        <small>Oyun yatay oynanır</small>
      </div>

      <div className="arena">
        <div className="hud hud-l">
          <button type="button" className="hud-btn" onClick={onLeave} aria-label="Çık" title="Çık">
            ×
          </button>
          <span className="hud-chip">{state.round}. El</span>
          {!assist ? <span className="hud-chip unassisted">Yardımsız</span> : null}
        </div>
        <div className="hud hud-r">
          {kanli ? (
            <span className="hud-chip pot" title="Çanak">
              Çanak <b>{state.pot}</b>
            </span>
          ) : null}
          <button type="button" className="hud-btn" onClick={() => setSheet(true)} aria-label="Skor tablosu" title="Skor tablosu">
            ≡
          </button>
        </div>

        {state.players.map((p, i) => {
          const pos = POS[rel(i, you)];
          return (
            <Seat
              key={p.id}
              player={p}
              pos={pos}
              avatar={<AvatarView id={p.avatarId} size="md" />}
              active={i === state.currentIndex}
              acting={actingId === p.id}
            />
          );
        })}

        <section className="center">
          {POS.map((pos) => {
            const idx = (you + POS.indexOf(pos)) % 4;
            const p = state.players[idx];
            if (!p) return null;
            const melds = meldsByOwner.get(p.id) ?? [];
            return (
              <div key={pos} className={`zone ${pos} ${pos === "bottom" ? "mine" : ""}`}>
                {melds.length ? (
                  <div className="zone-card">
                    <div className="zone-head">
                      <AvatarView id={p.avatarId} size="sm" />
                      <strong>{pos === "bottom" ? "Sen" : p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name}</strong>
                      <em>
                        {p.goingPairs
                          ? `çift: ${melds.length}`
                          : `açtı: ${melds.reduce(
                              (sum, m) =>
                                sum +
                                m.tiles.reduce(
                                  (s, tile) =>
                                    m.addedBy?.[tile.id] && m.addedBy[tile.id] !== m.ownerId ? s : s + tileFacePoints(tile, m.okeyAs[tile.id]),
                                  0,
                                ),
                              0,
                            )} puan`}
                      </em>
                    </div>
                    <div className="zone-melds">
                      {melds.map((m) => (
                        <MeldView
                          key={m.id}
                          meld={m}
                          arriving={arriveMelds.has(m.id)}
                          arrivingTiles={arriveTiles}
                          dotColor={dotColor}
                          highlight={processTargets.has(m.id)}
                          onClick={processTargets.has(m.id) ? () => process(m) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="pile-cluster">
            <div className="pile-item">
              <TileView tile={state.indicator} />
            </div>
            <div className={`pile-item draw ${needDraw ? "glow" : ""}`}>
              <div className="pile-one" title="Çekme destesi">
                <TileBack onClick={needDraw ? () => onAction({ type: "drawPile" }) : undefined} />
                <b className="pile-count">{state.drawPileCount}</b>
              </div>
              <b className="well-label">Deste</b>
            </div>
          </div>

          {POS.map((pos) => {
            const idx = (you + POS.indexOf(pos)) % 4;
            const p = state.players[idx];
            const isMine = pos === "bottom";
            const takeable = needDraw && idx === prevIndex;
            return (
              <DiscardSpot
                key={pos}
                pos={pos}
                owner={p}
                takeable={takeable}
                droppable={isMine && canDiscard}
                hot={isMine && overDiscard}
                onTake={takeable ? () => onAction({ type: "drawDiscard" }) : undefined}
                onTap={isMine && canDiscard && selected.length === 1 ? () => discardTile(selected[0]) : undefined}
              />
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
            <button type="button" className="mini-btn" onClick={() => setGroups([])}>
              Sil
            </button>
          </div>
        ) : null}
      </div>

      <div className="rack-row">
        <div className="open-float">
          {canDiscard ? (
            <button
              type="button"
              className={`open-btn ${canOpenNow ? "ready" : ""}`}
              onClick={openHand}
              disabled={!canOpenNow}
              title={assist ? `Seri için en az 51 puan, çift için en az ${minPairs} çift` : "El aç"}
            >
              {openLabel}
            </button>
          ) : (
            <span className="status-pill">{status}</span>
          )}
          {flash ? <em className="status-flash">{flash}</em> : null}
        </div>
        <div className="rack-dock">
          <div className="rack-side left">
            <button type="button" onClick={() => arrangeRack("series")} title="Seri diz">
              <i aria-hidden>↻</i>
              <span>Seri diz</span>
            </button>
            <button type="button" onClick={() => arrangeRack("pairs")} title="Çift diz">
              <i aria-hidden>⇄</i>
              <span>Çift diz</span>
            </button>
          </div>
          <Istaka
            key={state.round}
            dealKey={`${state.round}-${state.indicator.id}`}
            tiles={state.yourHand}
            selected={selected}
            grouped={grouped}
            scored={assist ? rackScore.ids : undefined}
            onToggle={toggle}
            canDiscard={canDiscard}
            onDiscard={discardTile}
            onHoverDiscard={setOverDiscard}
            onLayout={onRackLayout}
            arrange={arrange}
          />
          <div className="rack-side right">
            {assist ? (
              <button type="button" onClick={hint} title="İpucu">
                <i aria-hidden>💡</i>
                <span>İpucu</span>
              </button>
            ) : null}
            {!opened ? (
              <button
                type="button"
                onClick={assist ? (canPairs && canDiscard ? openPairs : openPairsManual) : canDiscard ? openPairs : undefined}
                disabled={!assist ? !canDiscard : !(canPairs && canDiscard) && !groups.length && selected.length !== 2}
                title="Çifte git"
              >
                <i aria-hidden>⇉</i>
                <span>Çifte git</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {state.phase === "roundEnd" ? (
        <div className="modal-wrap">
          <div className="round-end">
            <h3>El bitti</h3>
            {state.finish ? (
              <p className="re-line">
                <b>{winner?.name}</b> kazandı
                {state.finish.withOkey ? " · okeyle" : ""}
                {state.finish.withPairs ? " · çiftle" : ""}
                {state.finish.multiplier > 1 ? ` · x${state.finish.multiplier}` : ""}
              </p>
            ) : (
              <p className="re-line">Taşlar bitti.</p>
            )}
            <table className="re-table">
              <thead>
                <tr>
                  <th>Oyuncu</th>
                  <th>Bu el</th>
                  <th>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((p) => {
                  const base = baseScores.current.get(p.id);
                  const delta = base === undefined ? 0 : p.score - base;
                  return (
                    <tr key={p.id} className={p.id === winner?.id ? "win" : ""}>
                      <td>{p.id === youPlayer?.id ? `${p.name} (sen)` : p.name}</td>
                      <td className={delta > 0 ? "pos" : delta < 0 ? "neg" : ""}>
                        {delta > 0 ? `+${delta}` : delta}
                      </td>
                      <td>{p.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {isHost ? (
              <button type="button" className="primary" onClick={() => onAction({ type: "nextRound" })}>
                Yeni el
              </button>
            ) : (
              <p className="muted">Oda sahibi yeni eli başlatacak.</p>
            )}
          </div>
        </div>
      ) : null}

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
