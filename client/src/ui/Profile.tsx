import { useState } from "react";
import { AVATARS } from "../social/avatars";
import type { UserProfile } from "../social/types";
import { AvatarView } from "./Avatar";

export function ProfileSheet({
  profile,
  cloud,
  onSave,
  onClose,
}: {
  profile: UserProfile;
  cloud: boolean;
  onSave: (patch: Pick<UserProfile, "displayName" | "avatarId">) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [avatarId, setAvatarId] = useState(profile.avatarId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await onSave({ displayName: name, avatarId });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi.");
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
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Oyuncu" />
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

        <div className="friend-code-box">
          <span>Arkadaş kodun</span>
          <strong>{profile.friendCode}</strong>
          <button type="button" className="ghost" onClick={() => void copyCode()}>
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>
        </div>
        <p className="muted tiny">
          {cloud
            ? "Kodunu paylaş; arkadaşın bu kodla istek gönderebilir. Profil Firestore’da tutulur."
            : "Firebase’i bağlayınca profil ve arkadaşlar buluta yazılır. Giriş ekranı sonra eklenecek; şimdilik anonim kimlik kullanılacak."}
        </p>

        {err ? <p className="error">{err}</p> : null}
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          Kaydet
        </button>
      </div>
    </div>
  );
}
