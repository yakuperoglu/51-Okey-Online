import { useState } from "react";
import { AVATARS } from "../social/avatars";
import { GOOGLE_SIGNIN_BONUS } from "../social/tokens";
import type { UserProfile } from "../social/types";
import { AvatarView } from "./Avatar";

export function ProfileSheet({
  profile,
  cloud,
  google,
  onSave,
  onGoogle,
  onClose,
}: {
  profile: UserProfile;
  cloud: boolean;
  google: boolean;
  onSave: (patch: Pick<UserProfile, "displayName" | "avatarId">) => Promise<void>;
  onGoogle: () => Promise<UserProfile>;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [avatarId, setAvatarId] = useState(profile.avatarId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tokens, setTokens] = useState(profile.tokens);
  const linked = google || profile.authProvider === "google";

  async function save() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await onSave({ displayName: name, avatarId });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const next = await onGoogle();
      setTokens(next.tokens);
      setName(next.displayName);
      if (next.tokens > profile.tokens) {
        setOk(`Google bağlandı. ${GOOGLE_SIGNIN_BONUS} jeton kazandın.`);
      } else {
        setOk("Google hesabın bağlandı.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google ile giriş yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-card">
        <header className="sheet-head">
          <p className="eyebrow">Profil</p>
          <h2>Adın ve simgen</h2>
          <button type="button" className="ghost sheet-x" onClick={onClose}>
            Kapat
          </button>
        </header>

        <div className="profile-hero">
          <AvatarView id={avatarId} size="lg" />
          <label>
            Görünen ad
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="misafir000000" />
          </label>
        </div>

        <p className="muted avatar-hint">Simge seç</p>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={avatarId === a.id ? "on" : ""}
              onClick={() => setAvatarId(a.id)}
              aria-label={a.label}
            >
              <AvatarView id={a.id} size="md" />
            </button>
          ))}
        </div>

        <div className="token-box">
          <span className="muted">Jeton</span>
          <strong>{tokens}</strong>
          <p className="muted tiny">
            Masalar şimdilik ücretsiz. Jetonlu masalar açılınca bakiyen buradan düşecek.
          </p>
        </div>

        <div className="auth-box">
          {linked ? (
            <p className="ok-msg">Google hesabın bağlı.</p>
          ) : (
            <>
              <p className="muted tiny">
                İstersen Google ile giriş yap; ilk seferde {GOOGLE_SIGNIN_BONUS} jeton kazanırsın. Misafir adın kalır.
              </p>
              <button type="button" className="google-btn" disabled={busy || !cloud} onClick={() => void googleSignIn()}>
                Google ile giriş
              </button>
            </>
          )}
        </div>

        <div className="friend-code-box">
          <span>Arkadaş kodun</span>
          <strong>{profile.friendCode}</strong>
          <button type="button" className="ghost" onClick={() => void copyCode()}>
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>
        </div>
        <p className="muted tiny">
          {cloud
            ? "Kodunu paylaş; arkadaşın bu kodla istek gönderebilir. İsimler ve jeton Firestore’da tutulur."
            : "Firebase’i bağlayınca misafir adın ve Google girişi buluta yazılır."}
        </p>

        {ok ? <p className="ok-msg">{ok}</p> : null}
        {err ? <p className="error">{err}</p> : null}
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          Kaydet
        </button>
      </div>
    </div>
  );
}
