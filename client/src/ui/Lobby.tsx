import type { Pairing, PublicRoom, RoomView, RoomVisibility, Ruleset } from "@okey/engine";
import type { UserProfile } from "../social/types";
import { AvatarView } from "./Avatar";

export function rulesetLabel(v: Ruleset) {
  return v === "kanli" ? "Kanlı 51" : "Normal 51";
}

export function pairingLabel(v: Pairing) {
  return v === "ciftli" ? "Çiftli" : "Tekli";
}

export function Lobby({
  profile,
  incomingCount,
  onlineHint,
  code,
  setCode,
  minPairs,
  setMinPairs,
  ruleset,
  setRuleset,
  pairing,
  setPairing,
  visibility,
  setVisibility,
  rooms,
  filterRuleset,
  setFilterRuleset,
  filterPairing,
  setFilterPairing,
  filterPairs,
  setFilterPairs,
  filterOpen,
  setFilterOpen,
  queue,
  searching,
  showRooms,
  onShowRooms,
  onCreate,
  onJoin,
  onJoinRoom,
  onSolo,
  onQuick,
  onCancelQueue,
  onRefresh,
  onOpenProfile,
  onOpenFriends,
  onOpenSettings,
  onOpenHelp,
  error,
}: {
  profile: UserProfile | null;
  incomingCount: number;
  onlineHint: number;
  code: string;
  setCode: (v: string) => void;
  minPairs: 4 | 5;
  setMinPairs: (v: 4 | 5) => void;
  ruleset: Ruleset;
  setRuleset: (v: Ruleset) => void;
  pairing: Pairing;
  setPairing: (v: Pairing) => void;
  visibility: RoomVisibility;
  setVisibility: (v: RoomVisibility) => void;
  rooms: PublicRoom[];
  filterRuleset: Ruleset | "all";
  setFilterRuleset: (v: Ruleset | "all") => void;
  filterPairing: Pairing | "all";
  setFilterPairing: (v: Pairing | "all") => void;
  filterPairs: 4 | 5 | "all";
  setFilterPairs: (v: 4 | 5 | "all") => void;
  filterOpen: boolean;
  setFilterOpen: (v: boolean) => void;
  queue: { waiting: number; need: number } | null;
  searching: boolean;
  showRooms: boolean;
  onShowRooms: (v: boolean) => void;
  onCreate: () => void;
  onJoin: () => void;
  onJoinRoom: (code: string) => void;
  onSolo: () => void;
  onQuick: () => void;
  onCancelQueue: () => void;
  onRefresh: () => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  error: string | null;
}) {
  const filtered = rooms.filter((r) => {
    if (filterRuleset !== "all" && r.ruleset !== filterRuleset) return false;
    if (filterPairing !== "all" && r.pairing !== filterPairing) return false;
    if (filterPairs !== "all" && r.minPairs !== filterPairs) return false;
    if (filterOpen && r.seats >= 4) return false;
    return true;
  });
  const liveCount = rooms.reduce((n, r) => n + r.seats, 0);

  return (
    <div className="home hall">
      <div className="hall-atmosphere" aria-hidden>
        <i className="mote m1" />
        <i className="mote m2" />
        <i className="mote m3" />
        <i className="mote m4" />
        <i className="mote m5" />
      </div>
      <header className="hall-top">
        <button type="button" className="hall-user" onClick={onOpenProfile}>
          <AvatarView id={profile?.avatarId} size="md" />
          <span>
            <strong>{profile?.displayName || "Oyuncu"}</strong>
            <em>{profile?.authProvider === "google" ? "Google" : "Misafir"} · {profile?.friendCode ?? "------"}</em>
          </span>
        </button>
        <div className="hall-logo">
          <b>51</b>
          <span>OKEY</span>
        </div>
        <div className="hall-meta">
          <span className="chip-tokens">{profile?.tokens ?? 0} jeton</span>
          <span className="chip-live">{Math.max(onlineHint, liveCount)} çevrimiçi</span>
        </div>
      </header>

      <main className="plaza">
        <article className="hall-card train">
          <p className="card-kicker">Antrenman odası</p>
          <h2>Bot masası</h2>
          <p>Kuralları dene, 3 botla hemen otur.</p>
          <div className="card-duo">
            <button type="button" className="card-btn ghost-btn" onClick={onOpenHelp}>
              Eğitim
            </button>
            <button type="button" className="card-btn" onClick={onSolo}>
              Oyna
            </button>
          </div>
        </article>

        <article className={`hall-card live ${ruleset === "kanli" ? "is-kanli" : ""}`}>
          <p className="card-kicker">{ruleset === "kanli" ? "Kanlı masa" : "Tek katlamasız"}</p>
          <h2>{rulesetLabel(ruleset)}</h2>
          <p>
            {pairingLabel(pairing)} · {minPairs} çift
          </p>
          <span className="live-pill">{liveCount} oyuncu masada</span>
          <div className="card-chips">
            <button type="button" className={ruleset === "normal" ? "on" : ""} onClick={() => setRuleset("normal")}>
              Normal
            </button>
            <button type="button" className={ruleset === "kanli" ? "on" : ""} onClick={() => setRuleset("kanli")}>
              Kanlı
            </button>
            <button type="button" className={pairing === "tekli" ? "on" : ""} onClick={() => setPairing("tekli")}>
              Tekli
            </button>
            <button type="button" className={pairing === "ciftli" ? "on" : ""} onClick={() => setPairing("ciftli")}>
              Çiftli
            </button>
            <button type="button" className={minPairs === 4 ? "on" : ""} onClick={() => setMinPairs(4)}>
              4 çift
            </button>
            <button type="button" className={minPairs === 5 ? "on" : ""} onClick={() => setMinPairs(5)}>
              5 çift
            </button>
          </div>
          {searching ? (
            <div className="queue-mini">
              Sıra {queue?.waiting ?? 1}/{queue?.need ?? 4}
              <button type="button" onClick={onCancelQueue}>
                İptal
              </button>
            </div>
          ) : (
            <button type="button" className="card-btn join" onClick={onQuick}>
              Katıl
            </button>
          )}
        </article>

        <article className="hall-card priv">
          <p className="card-kicker">Şifreli masa</p>
          <h2>Özel oda</h2>
          <p>Kodla gir veya yeni masa aç.</p>
          <form
            className="priv-row"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin();
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="KOD"
              maxLength={6}
              className="code"
            />
            <button type="submit">Gir</button>
          </form>
          <div className="priv-actions">
            <button type="button" className={visibility === "public" ? "on" : ""} onClick={() => setVisibility("public")}>
              Açık
            </button>
            <button type="button" className={visibility === "private" ? "on" : ""} onClick={() => setVisibility("private")}>
              Gizli
            </button>
            <button type="button" className="card-btn" onClick={onCreate}>
              Masa aç
            </button>
          </div>
        </article>
      </main>

      {error ? <p className="hall-error">{error}</p> : null}

      <footer className="hall-dock">
        <div className="dock-left">
          <button type="button" className="round-btn" onClick={onOpenFriends} aria-label="Arkadaşlar">
            👥
            {incomingCount > 0 ? <i>{incomingCount}</i> : null}
          </button>
          <button type="button" className="round-btn" onClick={() => onShowRooms(true)} aria-label="Masalar">
            🀄
            {rooms.length ? <i>{rooms.length}</i> : null}
          </button>
          <button type="button" className="round-btn" onClick={onOpenHelp} aria-label="Yardım">
            ?
          </button>
        </div>

        {searching ? (
          <button type="button" className="hemen-oyna wait" onClick={onCancelQueue}>
            Aranıyor {queue?.waiting ?? 1}/{queue?.need ?? 4}
            <small>iptal</small>
          </button>
        ) : (
          <button type="button" className="hemen-oyna" onClick={onQuick}>
            Hemen oyna
            <small>{rulesetLabel(ruleset)} · {pairingLabel(pairing)}</small>
          </button>
        )}

        <div className="dock-right">
          <button type="button" className="round-btn" onClick={onOpenSettings} aria-label="Ayarlar">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path
                fill="currentColor"
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.8 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.92 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.06.24.26.42.5.42h3.8c.24 0 .44-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
              />
            </svg>
          </button>
        </div>
      </footer>

      {showRooms ? (
        <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) onShowRooms(false); }}>
          <div className="sheet-card rooms-sheet">
            <header className="sheet-head">
              <p className="eyebrow">Açık masalar</p>
              <h2>Herkese açık odalar</h2>
              <button type="button" className="ghost sheet-x" onClick={() => onShowRooms(false)}>
                Kapat
              </button>
            </header>
            <div className="filters">
              <button
                type="button"
                className={filterRuleset === "all" && filterPairing === "all" && filterPairs === "all" && !filterOpen ? "on" : ""}
                onClick={() => {
                  setFilterRuleset("all");
                  setFilterPairing("all");
                  setFilterPairs("all");
                  setFilterOpen(false);
                }}
              >
                Tümü
              </button>
              <button type="button" className={filterRuleset === "normal" ? "on" : ""} onClick={() => setFilterRuleset(filterRuleset === "normal" ? "all" : "normal")}>
                Normal
              </button>
              <button type="button" className={filterRuleset === "kanli" ? "on" : ""} onClick={() => setFilterRuleset(filterRuleset === "kanli" ? "all" : "kanli")}>
                Kanlı
              </button>
              <button type="button" className={filterPairing === "tekli" ? "on" : ""} onClick={() => setFilterPairing(filterPairing === "tekli" ? "all" : "tekli")}>
                Tekli
              </button>
              <button type="button" className={filterPairing === "ciftli" ? "on" : ""} onClick={() => setFilterPairing(filterPairing === "ciftli" ? "all" : "ciftli")}>
                Çiftli
              </button>
              <button type="button" onClick={onRefresh}>
                Yenile
              </button>
            </div>
            <ul className="room-list">
              {filtered.length === 0 ? (
                <li className="empty">Açık masa yok. Hemen oyna ile sıraya gir.</li>
              ) : (
                filtered.map((r) => (
                  <li key={r.code}>
                    <AvatarView id={r.hostAvatarId} size="sm" />
                    <div>
                      <strong>{r.hostName}</strong>
                      <p>
                        {rulesetLabel(r.ruleset)} · {pairingLabel(r.pairing)} · {r.minPairs} çift
                      </p>
                    </div>
                    <span className="seats-n">{r.seats}/4</span>
                    <button type="button" className="primary" onClick={() => onJoinRoom(r.code)} disabled={r.seats >= 4}>
                      Katıl
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Waiting({
  room,
  youAreHost,
  onAddBot,
  onFill,
  onStart,
  onLeave,
  error,
}: {
  room: RoomView;
  youAreHost: boolean;
  onAddBot: () => void;
  onFill: () => void;
  onStart: () => void;
  onLeave: () => void;
  error: string | null;
}) {
  return (
    <div className="waiting hall-wait">
      <div className="wait-card">
        <p className="eyebrow">{room.visibility === "public" ? "Herkese açık" : "Özel oda"}</p>
        <h2>{room.code}</h2>
        <p className="muted">
          {rulesetLabel(room.ruleset)} · {pairingLabel(room.pairing)} · {room.minPairs} çift
          {room.visibility === "private" ? " · Kodu arkadaşlarınla paylaş" : " · Açık listede görünür"}
        </p>
        <div className="wait-felt">
          <ul className="wait-seats">
            {Array.from({ length: 4 }).map((_, i) => {
              const seat = room.seats[i];
              return (
                <li key={i} className={seat ? "filled" : ""}>
                  {seat ? <AvatarView id={seat.avatarId} size="md" /> : <span className="n">{i + 1}</span>}
                  <span>{seat ? `${seat.name}${seat.isBot ? " · bot" : ""}` : "Boş koltuk"}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {youAreHost ? (
          <div className="actions">
            <button type="button" onClick={onAddBot} disabled={room.seats.length >= 4}>
              Bot ekle
            </button>
            <button type="button" className="ghost" onClick={onFill} disabled={room.seats.length >= 4}>
              Botlarla doldur
            </button>
            <button type="button" className="primary" onClick={onStart} disabled={room.seats.length !== 4}>
              Oyunu başlat
            </button>
          </div>
        ) : (
          <p className="muted">Oda sahibinin başlatması bekleniyor…</p>
        )}
        <button type="button" className="ghost" onClick={onLeave}>
          Masadan ayrıl
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
