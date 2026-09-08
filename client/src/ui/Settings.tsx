import { useEffect } from "react";

const SOUND_KEY = "okey-sound";

export function readSoundOn() {
  return localStorage.getItem(SOUND_KEY) !== "off";
}

export function SettingsSheet({
  soundOn,
  setSoundOn,
  onProfile,
  onClose,
}: {
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
  }, [soundOn]);

  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-card settings-card">
        <header className="sheet-head">
          <p className="eyebrow">Menü</p>
          <h2>Ayarlar</h2>
          <button type="button" className="ghost sheet-x" onClick={onClose}>
            Kapat
          </button>
        </header>
        <label className="set-row">
          <span>Ses</span>
          <button type="button" className={`seg-mini ${soundOn ? "on" : ""}`} onClick={() => setSoundOn(!soundOn)}>
            {soundOn ? "Açık" : "Kapalı"}
          </button>
        </label>
        <button type="button" className="ghost" onClick={onProfile}>
          Profili düzenle
        </button>
        <p className="muted tiny">Google ile giriş profil ekranından yapılır. İlk Google kaydında 100 jeton verilir.</p>
      </div>
    </div>
  );
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-card">
        <header className="sheet-head">
          <p className="eyebrow">Yardım</p>
          <h2>Nasıl oynanır</h2>
          <button type="button" className="ghost sheet-x" onClick={onClose}>
            Kapat
          </button>
        </header>
        <ul className="help-list">
          <li>51 puanlık per açmadan elini bitiremezsin.</li>
          <li>Hızlı oyun, uygun açık masaya atar; yoksa 4 kişi birikince eşleşir.</li>
          <li>Kanlı 51’de her el çanağa giriş vardır.</li>
          <li>Çiftlide karşındaki eşinle aynı takımdasın.</li>
        </ul>
      </div>
    </div>
  );
}
