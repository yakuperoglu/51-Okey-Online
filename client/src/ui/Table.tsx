import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  canAttach,
  canSwapOkey,
  tileFacePoints,
  type ClientGameState,
  type GameAction,
  type OkeyIdentity,
  type PublicPlayer,
  type TableMeld,
} from "@okey/engine";
import { Istaka, isDrawDrop } from "./Istaka";
import { scoreRack } from "./rackScore";
import { TileBack, TileView } from "./Tile";
import { AvatarView } from "./Avatar";
import { ScoreSheet } from "./ScoreSheet";
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

const EMPTY_IDS: Set<string> = new Set();

function rel(index: number, you: number) {
  return (index - you + 4) % 4;
}


function MeldView({
  meld,
  arriving,
  arrivingTiles,
  dotColor,
  onClick,
}: {
  meld: TableMeld;
  arriving?: boolean;
  arrivingTiles?: Set<string>;
  dotColor?: (playerId: string) => string | undefined;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`meld ${meld.type} ${arriving ? "arrive" : ""}`}
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
  returnDrop,
  onTake,
  onTakeDragStart,
  onTap,
  okey,
}: {
  pos: Pos;
  okey: OkeyIdentity;
  owner: PublicPlayer | undefined;
  takeable?: boolean;
  droppable?: boolean;
  hot?: boolean;
  /** Marks the previous player's pile as the place a taken-but-unused tile can be put back. */
  returnDrop?: boolean;
  onTake?: () => void;
  onTakeDragStart?: (event: React.PointerEvent) => void;
  onTap?: () => void;
}) {
  const pile = owner?.discard ?? [];
  const last = pile[pile.length - 1];
  const under = pile[pile.length - 2];
  return (
    <div
      className={`discard-spot ${pos} ${takeable ? "takeable" : ""} ${droppable ? "droppable" : ""} ${hot ? "hot" : ""}`}
      {...(pos === "bottom" ? { "data-discard-drop": "" } : {})}
      {...(returnDrop ? { "data-return-drop": "" } : {})}
      title={pos === "bottom" ? "Taşı buraya bırakarak at" : undefined}
      onClick={onTap}
    >
      {under ? (
        <span className="under">
          <TileView tile={under} small concealAs={okey} />
        </span>
      ) : null}
      {last ? (
        <span className="top-tile" onPointerDown={takeable ? onTakeDragStart : undefined}>
          <TileView tile={last} onClick={takeable ? onTake : undefined} concealAs={okey} />
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
  const [sheet, setSheet] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [rackSlots, setRackSlots] = useState<(string | null)[]>([]);
  const [overDiscard, setOverDiscard] = useState(false);
  const [overReturn, setOverReturn] = useState(false);
  const [flying, setFlying] = useState<FlyChip[]>([]);
  const [arriveMelds, setArriveMelds] = useState<Set<string>>(new Set());
  const [arriveTiles, setArriveTiles] = useState<Set<string>>(new Set());
  const [actingId, setActingId] = useState<string | null>(null);
  const [takeDrag, setTakeDrag] = useState<{ kind: "pile" | "discard"; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const placeRef = useRef<number | null>(null);
  const [flippedState, setFlippedState] = useState<{ round: number; ids: Set<string> }>({ round: state.round, ids: new Set() });
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

  // Okeys stay face-natural until the player double-clicks them; reset every round.
  const flipped = flippedState.round === state.round ? flippedState.ids : EMPTY_IDS;
  const flipTile = useCallback(
    (id: string) =>
      setFlippedState((cur) => {
        const ids = new Set(cur.round === state.round ? cur.ids : []);
        if (!ids.delete(id)) ids.add(id);
        return { round: state.round, ids };
      }),
    [state.round],
  );

  const rackScore = useMemo(() => scoreRack(rackSlots, state.yourHand), [rackSlots, state.yourHand]);
  const returnTileId =
    state.isYourTurn && state.phase === "playing" && state.turn.tookDiscard && state.turn.mustUseTileId && state.yourHand.some((t) => t.id === state.turn.mustUseTileId)
      ? state.turn.mustUseTileId
      : null;
  const canDiscard = state.isYourTurn && !needDraw && state.phase === "playing";

  // Contiguous valid blocks on the rack count as the player's own melds (no hints: only a number is shown).
  const opened = Boolean(youPlayer?.opened);
  const seriesGroups = rackScore.groups;
  const pairGroups = rackScore.pairGroups;
  // Mode is chosen automatically from the rack: series at 51+, else pairs at minPairs, else the one relatively closer.
  const pairsActive =
    !opened &&
    rackScore.points < 51 &&
    (pairGroups.length >= minPairs || pairGroups.length / Math.max(1, minPairs) > rackScore.points / 51);
  const counterValue = pairsActive ? pairGroups.length : rackScore.points;
  const showOpen = !opened && canDiscard && (pairsActive ? pairGroups.length >= minPairs : rackScore.points >= 51);
  // After opening: new melds go down with the same "open" action (pairs players only add pairs).
  const layGroups = opened ? (youPlayer?.goingPairs ? pairGroups : seriesGroups) : [];
  const showLay = opened && canDiscard && layGroups.length > 0;

  const meldsByOwner = useMemo(() => {
    const map = new Map<string, TableMeld[]>();
    for (const m of state.tableMelds) {
      const list = map.get(m.ownerId) ?? [];
      list.push(m);
      map.set(m.ownerId, list);
    }
    return map;
  }, [state.tableMelds]);

  // Meld area must show every meld without scrolling: shrink meld tiles until all four zones fit.
  const centerRef = useRef<HTMLElement | null>(null);
  const [centerBox, setCenterBox] = useState("");
  const meldSig = state.tableMelds.map((m) => `${m.id}:${m.tiles.length}`).join(",");
  useEffect(() => {
    const el = centerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCenterBox(`${el.clientWidth}x${el.clientHeight}`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const zones = Array.from(el.querySelectorAll<HTMLElement>(".zone"));
    const fits = () => zones.every((z) => z.scrollHeight <= z.clientHeight + 1 && z.scrollWidth <= z.clientWidth + 1);
    let hi = Math.max(26, Math.min(56, Math.round(window.innerHeight * 0.09)));
    let lo = 11;
    el.style.setProperty("--mh", `${hi}px`);
    if (fits()) return;
    while (hi - lo > 0.5) {
      const mid = (hi + lo) / 2;
      el.style.setProperty("--mh", `${mid}px`);
      if (fits()) lo = mid;
      else hi = mid;
    }
    el.style.setProperty("--mh", `${lo}px`);
  }, [meldSig, centerBox, state.players.length, state.phase]);

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

  /** Draw by dragging the deck / the previous discard onto the rack (also works on touch). */
  function startTakeDrag(event: React.PointerEvent, kind: "pile" | "discard") {
    if (!needDraw || event.button > 0) return;
    const sx = event.clientX;
    const sy = event.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true;
      if (moved) setTakeDrag({ kind, x: ev.clientX, y: ev.clientY });
    };
    const finish = (ev: PointerEvent, drop: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setTakeDrag(null);
      if (!moved) return; // a plain tap: the click handler draws
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 60);
      if (!drop) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!isDrawDrop(sy, ev.clientX, ev.clientY)) return;
      const slot = Number(el?.closest("[data-slot]")?.getAttribute("data-slot"));
      placeRef.current = Number.isInteger(slot) ? slot : null;
      window.setTimeout(() => {
        placeRef.current = null;
      }, 2500);
      onAction({ type: kind === "pile" ? "drawPile" : "drawDiscard" });
    };
    const up = (ev: PointerEvent) => finish(ev, true);
    const cancel = (ev: PointerEvent) => finish(ev, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function openHand() {
    if (!showOpen) return;
    if (pairsActive) {
      onAction({ type: "open", groups: pairGroups, goingPairs: true });
    } else {
      onAction({ type: "open", groups: seriesGroups, goingPairs: false });
    }
    setSelected([]);
  }

  function layDown() {
    if (!showLay) return;
    onAction({ type: "open", groups: layGroups, goingPairs: Boolean(youPlayer?.goingPairs) });
    setSelected([]);
  }

  function returnDiscard() {
    if (!returnTileId) return;
    onAction({ type: "returnDiscard" });
    setSelected([]);
  }

  function discardTile(tileId: string) {
    if (!canDiscard) return;
    onAction({ type: "discard", tileId });
    setSelected([]);
  }

  function process(meld: TableMeld) {
    if (selected.length !== 1 || !opened) return;
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
          <span className="hud-chip" title="El / toplam el · çarpan">
            {state.round}/{state.config.totalRounds}. El <b>×{state.handMultiplier}</b>
          </span>
          {!opened && state.phase === "playing" ? (
            <span className="hud-chip hand-counter" title="Dizdiğin perlerin puanı">
              <b>{counterValue}</b> {pairsActive ? "çift" : "puan"}
            </span>
          ) : null}
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

        <section className="center" ref={centerRef}>
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
                          onClick={opened && selected.length === 1 ? () => process(m) : undefined}
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
                <TileBack
                  onClick={needDraw ? () => !suppressClick.current && onAction({ type: "drawPile" }) : undefined}
                  onPointerDown={needDraw ? (e) => startTakeDrag(e, "pile") : undefined}
                />
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
                okey={state.okey}
                takeable={takeable}
                droppable={isMine && canDiscard}
                hot={(isMine && overDiscard) || (idx === prevIndex && overReturn)}
                returnDrop={idx === prevIndex && Boolean(returnTileId)}
                onTake={takeable ? () => !suppressClick.current && onAction({ type: "drawDiscard" }) : undefined}
                onTakeDragStart={takeable ? (e) => startTakeDrag(e, "discard") : undefined}
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

      </div>

      <div className="rack-row">
        <div className="open-float">
          {returnTileId ? (
            <button type="button" className="open-btn ready return-btn" onClick={returnDiscard}>
              Geri koy
            </button>
          ) : null}
          {showOpen ? (
            <button type="button" className="open-btn ready open-hand" onClick={openHand}>
              El aç
            </button>
          ) : null}
          {showLay ? (
            <button type="button" className="open-btn ready lay-btn" onClick={layDown}>
              Masaya diz
            </button>
          ) : null}
          {!showOpen && !showLay ? <span className="status-pill">{status}</span> : null}
          {flash ? <em className="status-flash">{flash}</em> : null}
        </div>
        <div className="rack-dock">
          <Istaka
            key={state.round}
            dealKey={`${state.round}-${state.indicator.id}`}
            tiles={state.yourHand}
            selected={selected}
            onToggle={toggle}
            canDiscard={canDiscard}
            onDiscard={discardTile}
            onHoverDiscard={setOverDiscard}
            returnTileId={returnTileId}
            onReturn={returnDiscard}
            onHoverReturn={setOverReturn}
            onLayout={onRackLayout}
            okey={state.okey}
            flipped={flipped}
            onFlip={flipTile}
            placeRef={placeRef}
          />
        </div>
      </div>

      {takeDrag ? (
        <div className="tile-ghost lifted" style={{ left: takeDrag.x, top: takeDrag.y }}>
          {takeDrag.kind === "pile" ? (
            <TileBack />
          ) : (
            (() => {
              const top = state.players[prevIndex]?.discard.slice(-1)[0];
              return top ? <TileView tile={top} concealAs={state.okey} /> : <TileBack />;
            })()
          )}
        </div>
      ) : null}

      {state.phase === "roundEnd" || state.phase === "matchEnd" ? (() => {
        const matchEnd = state.phase === "matchEnd";
        const mr = state.matchResult;
        const myId = youPlayer?.id;
        const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? "";
        const highest = mr ? state.players.find((p) => p.id === mr.highestPlayerId) : undefined;
        const iLost = Boolean(mr && myId && mr.loserTeam.includes(myId));
        return (
        <div className="modal-wrap">
          <div className={`round-end${matchEnd ? " match-end" : ""}`}>
            <h3>El bitti · ×{state.finish?.handMultiplier ?? state.handMultiplier}</h3>
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
            {matchEnd && mr ? (
              <div className={`match-result ${iLost ? "lost" : "won"}`}>
                <h4>Oyun bitti</h4>
                <p className="mr-big">{iLost ? "Kaybettiniz" : "Kazandınız!"}</p>
                <p className="mr-why">
                  En yüksek puan: <b>{highest?.name}</b> ({highest?.score}) — {mr.loserTeam.map(nameOf).join(" & ")} kaybetti
                </p>
                <p className="mr-win">Kazanan: {mr.winnerTeam.map(nameOf).join(" & ")}</p>
                <ScoreSheet state={state} compact />
              </div>
            ) : null}
            {matchEnd ? (
              <button type="button" className="primary" onClick={onLeave}>
                Lobiye dön
              </button>
            ) : isHost ? (
              <button type="button" className="primary" onClick={() => onAction({ type: "nextRound" })}>
                Yeni el
              </button>
            ) : (
              <p className="muted">Oda sahibi yeni eli başlatacak.</p>
            )}
          </div>
        </div>
        );
      })() : null}

      {sheet ? (
        <div className="sheet" onClick={() => setSheet(false)}>
          <div className="sheet-card nb-card" onClick={(e) => e.stopPropagation()}>
            <ScoreSheet state={state} />
            <button type="button" className="nb-logtoggle" onClick={() => setShowLog((v) => !v)}>
              Olaylar {showLog ? "▴" : "▾"}
            </button>
            {showLog ? (
              <ul className="log">
                {state.events.map((e) => (
                  <li key={e.id} className={e.kind}>
                    {e.text}
                  </li>
                ))}
              </ul>
            ) : null}
            <button type="button" className="primary" onClick={() => setSheet(false)}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
