import { useState } from "react";
import type { FriendDoc, IncomingRequest, UserProfile } from "../social/types";
import { AvatarView } from "./Avatar";

export function FriendsSheet({
  profile,
  cloud,
  friends,
  incoming,
  onAdd,
  onAccept,
  onDecline,
  onRemove,
  onClose,
}: {
  profile: UserProfile;
  cloud: boolean;
  friends: FriendDoc[];
  incoming: IncomingRequest[];
  onAdd: (code: string) => Promise<void>;
  onAccept: (req: IncomingRequest) => Promise<void>;
  onDecline: (fromUid: string) => Promise<void>;
  onRemove: (uid: string) => Promise<void>;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await onAdd(code);
      setCode("");
      setOk("İstek gönderildi.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eklenemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-card">
        <header className="sheet-head">
          <p className="eyebrow">Sosyal</p>
          <h2>Arkadaşlar</h2>
          <button type="button" className="ghost sheet-x" onClick={onClose}>
            Kapat
          </button>
        </header>

        <p className="muted tiny">
          Senin kodun <strong>{profile.friendCode}</strong>. Arkadaşının kodunu yazarak istek gönder.
          {!cloud ? " Firebase yokken istekler bu cihazda kalır." : null}
        </p>

        <form
          className="code-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ARKADAŞ KODU"
            maxLength={8}
            className="code"
          />
          <button type="submit" className="primary" disabled={busy || code.trim().length < 4}>
            Ekle
          </button>
        </form>
        {ok ? <p className="ok-msg">{ok}</p> : null}
        {err ? <p className="error">{err}</p> : null}

        {incoming.length ? (
          <section className="social-block">
            <h3>Gelen istekler</h3>
            <ul className="social-list">
              {incoming.map((r) => (
                <li key={r.fromUid}>
                  <AvatarView id={r.fromAvatar} size="sm" />
                  <strong>{r.fromName}</strong>
                  <button type="button" className="primary" onClick={() => void onAccept(r)}>
                    Kabul
                  </button>
                  <button type="button" className="ghost" onClick={() => void onDecline(r.fromUid)}>
                    Reddet
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="social-block">
          <h3>Liste ({friends.length})</h3>
          <ul className="social-list">
            {friends.length === 0 ? (
              <li className="empty">Henüz arkadaş yok.</li>
            ) : (
              friends.map((f) => (
                <li key={f.uid}>
                  <AvatarView id={f.avatarId} size="sm" />
                  <strong>{f.displayName}</strong>
                  <button type="button" className="ghost" onClick={() => void onRemove(f.uid)}>
                    Çıkar
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
