import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
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
  const name = localStorage.getItem("okey-name") ?? undefined;
  return name ? { displayName: name } : {};
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
  const [friends, setFriends] = useState<FriendDoc[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const fb = getFirebase();

    async function boot(nextUid: string) {
      const next = await repo.ensureProfile(nextUid, seedFromStorage());
      if (stop) return;
      setUid(nextUid);
      setProfile(next);
      localStorage.setItem("okey-name", next.displayName);
      setReady(true);
    }

    if (!fb) {
      void boot(localUid()).catch((e) => setError(e instanceof Error ? e.message : "Profil açılamadı."));
      return () => {
        stop = true;
      };
    }

    const unsub = onAuthStateChanged(fb.auth, (user) => {
      if (user) {
        void boot(user.uid).catch((e) => setError(e instanceof Error ? e.message : "Profil açılamadı."));
        return;
      }
      void signInAnonymously(fb.auth).catch((e) => {
        setError(e instanceof Error ? e.message : "Anonim oturum açılamadı.");
      });
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
    profile,
    friends,
    incoming,
    error,
    saveProfile,
    addFriend,
    accept,
    decline,
    removeFriend,
  };
}
