import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  linkWithPopup,
  type User,
} from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { getFirebase, isFirebaseConfigured } from "./firebase";
import { createFirestoreRepo } from "./firestoreRepo";
import { localRepo } from "./localRepo";
import type { FriendDoc, IncomingRequest, UserProfile } from "./types";

const LOCAL_UID_KEY = "okey-uid";

function localUid(): string {
  let id = localStorage.getItem(LOCAL_UID_KEY);
  if (!id) {
    id = `local_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(LOCAL_UID_KEY, id);
  }
  return id;
}

function seedFromStorage(): Partial<UserProfile> {
  const name = localStorage.getItem("okey-name") ?? "";
  if (!name || name === "Oyuncu") return {};
  return { displayName: name };
}

function isGoogleUser(user: User | null): boolean {
  return Boolean(user?.providerData.some((p) => p.providerId === "google.com"));
}

function authMessage(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: string }).code) : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Google girişi iptal edildi.";
  }
  if (code === "auth/popup-blocked") return "Açılır pencere engellendi. Tarayıcı iznini aç.";
  if (code === "auth/unauthorized-domain") {
    return "Bu adres Firebase Authentication’da yetkili değil.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase’de Anonymous ve Google sağlayıcılarını aç.";
  }
  return e instanceof Error ? e.message : "Giriş yapılamadı.";
}

export function useSocial() {
  const cloud = isFirebaseConfigured();
  const repo = useMemo(() => {
    const fb = getFirebase();
    return fb ? createFirestoreRepo(fb.db) : localRepo;
  }, []);

  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [google, setGoogle] = useState(false);
  const [friends, setFriends] = useState<FriendDoc[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const fb = getFirebase();

    async function boot(nextUid: string, withGoogle: boolean) {
      const next = await repo.ensureProfile(nextUid, seedFromStorage(), withGoogle);
      if (stop) return;
      setUid(nextUid);
      setProfile(next);
      setGoogle(withGoogle || next.authProvider === "google");
      localStorage.setItem("okey-name", next.displayName);
      setReady(true);
    }

    if (!fb) {
      void boot(localUid(), false).catch((e) => setError(e instanceof Error ? e.message : "Profil açılamadı."));
      return () => {
        stop = true;
      };
    }

    // Önce kayıtlı oturumu bekle; erken null gelince signInAnonymously yeni misafir üretir.
    void (async () => {
      try {
        await fb.auth.authStateReady();
        if (stop) return;
        if (!fb.auth.currentUser) {
          await signInAnonymously(fb.auth);
        }
      } catch (e) {
        if (!stop) setError(authMessage(e) || "Anonim oturum açılamadı.");
      }
    })();

    const unsub = onAuthStateChanged(fb.auth, (user) => {
      if (!user) return;
      void boot(user.uid, isGoogleUser(user)).catch((e) =>
        setError(e instanceof Error ? e.message : "Profil açılamadı."),
      );
    });

    return () => {
      stop = true;
      unsub();
    };
  }, [repo]);

  useEffect(() => {
    if (!uid) return;
    const a = repo.watchFriends(uid, setFriends);
    const b = repo.watchIncoming(uid, setIncoming);
    return () => {
      a();
      b();
    };
  }, [repo, uid]);

  async function saveProfile(patch: Pick<UserProfile, "displayName" | "avatarId">) {
    if (!profile) return;
    setError(null);
    const next = await repo.saveProfile({ ...profile, ...patch });
    setProfile(next);
    localStorage.setItem("okey-name", next.displayName);
  }

  async function signInGoogle() {
    const fb = getFirebase();
    if (!fb) throw new Error("Firebase bağlı değil. client/.env dosyasını doldur.");
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const current = fb.auth.currentUser;
    try {
      if (current?.isAnonymous && !isGoogleUser(current)) {
        try {
          await linkWithPopup(current, provider);
        } catch (e) {
          const code = typeof e === "object" && e && "code" in e ? String((e as { code: string }).code) : "";
          if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
            const cred = GoogleAuthProvider.credentialFromError(e as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
            if (cred) await signInWithCredential(fb.auth, cred);
            else await signInWithPopup(fb.auth, provider);
          } else {
            throw e;
          }
        }
      } else {
        await signInWithPopup(fb.auth, provider);
      }
    } catch (e) {
      throw new Error(authMessage(e));
    }
    const user = fb.auth.currentUser;
    if (!user) throw new Error("Google oturumu açılamadı.");
    const next = await repo.applyGoogleAccount(user.uid);
    setUid(user.uid);
    setProfile(next);
    setGoogle(true);
    localStorage.setItem("okey-name", next.displayName);
    return next;
  }

  async function addFriend(code: string) {
    if (!profile) return;
    setError(null);
    const target = await repo.findByFriendCode(code);
    if (!target) {
      throw new Error(
        cloud
          ? "Bu kodla oyuncu bulunamadı."
          : "Bu kodla oyuncu bulunamadı. Arkadaşlık için Firebase’i bağla; şimdilik yalnızca bu cihazda profil tutuluyor.",
      );
    }
    await repo.sendRequest(profile, target);
  }

  async function accept(req: IncomingRequest) {
    if (!profile) return;
    setError(null);
    await repo.acceptRequest(profile, req);
  }

  async function decline(fromUid: string) {
    if (!uid) return;
    setError(null);
    await repo.declineRequest(uid, fromUid);
  }

  async function removeFriend(friendUid: string) {
    if (!uid) return;
    setError(null);
    await repo.removeFriend(uid, friendUid);
  }

  return {
    ready,
    cloud,
    google,
    profile,
    friends,
    incoming,
    error,
    saveProfile,
    signInGoogle,
    addFriend,
    accept,
    decline,
    removeFriend,
  };
}
