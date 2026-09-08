import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { DEFAULT_AVATAR, sanitizeAvatarId } from "./avatars";
import { makeFriendCode } from "./codes";
import { displayNameKey, normalizeDisplayName, randomGuestName } from "./guestName";
import { GOOGLE_SIGNIN_BONUS } from "./tokens";
import type { AuthProvider, FriendDoc, IncomingRequest, SocialRepo, UserProfile } from "./types";

function userRef(db: Firestore, uid: string) {
  return doc(db, "users", uid);
}

function nameRef(db: Firestore, name: string) {
  return doc(db, "displayNames", displayNameKey(name));
}

function asProfile(uid: string, data: Record<string, unknown>): UserProfile {
  const provider = data.authProvider === "google" ? "google" : "guest";
  return {
    uid,
    displayName: String(data.displayName ?? "misafir000000").slice(0, 16) || "misafir000000",
    avatarId: sanitizeAvatarId(String(data.avatarId ?? DEFAULT_AVATAR)),
    friendCode: String(data.friendCode ?? "").toUpperCase(),
    tokens: Math.max(0, Math.floor(Number(data.tokens ?? 0))),
    googleBonusClaimed: Boolean(data.googleBonusClaimed),
    authProvider: provider,
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

async function uniqueFriendCode(db: Firestore): Promise<string> {
  let friendCode = makeFriendCode();
  for (let i = 0; i < 5; i++) {
    const taken = await getDocs(
      query(collection(db, "users"), where("friendCode", "==", friendCode), limit(1)),
    );
    if (taken.empty) break;
    friendCode = makeFriendCode();
  }
  return friendCode;
}

async function claimDisplayName(db: Firestore, uid: string, name: string, previous?: string) {
  const next = normalizeDisplayName(name);
  if (!next) throw new Error("İsim boş olamaz.");
  await runTransaction(db, async (tx) => {
    const ref = nameRef(db, next);
    const snap = await tx.get(ref);
    if (snap.exists() && String(snap.data().uid) !== uid) {
      throw new Error("Bu isim başka bir oyuncuda kayıtlı.");
    }
    tx.set(ref, { uid });
    if (previous) {
      const prevKey = displayNameKey(previous);
      if (prevKey && prevKey !== displayNameKey(next)) {
        const old = nameRef(db, previous);
        const oldSnap = await tx.get(old);
        if (oldSnap.exists() && String(oldSnap.data().uid) === uid) tx.delete(old);
      }
    }
  });
}

async function allocateGuestName(db: Firestore, uid: string): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const name = randomGuestName();
    try {
      await claimDisplayName(db, uid, name);
      return name;
    } catch {
      /* çakıştı, yeniden dene */
    }
  }
  throw new Error("Misafir adı üretilemedi. Tekrar dene.");
}

async function grantGoogleBonus(db: Firestore, uid: string): Promise<UserProfile> {
  const ref = userRef(db, uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Profil bulunamadı.");
    const data = snap.data();
    const now = Date.now();
    if (data.googleBonusClaimed) {
      const patched = { ...data, authProvider: "google" as AuthProvider, updatedAt: now };
      if (data.authProvider !== "google") tx.set(ref, patched, { merge: true });
      return asProfile(uid, patched);
    }
    const tokens = Math.max(0, Math.floor(Number(data.tokens ?? 0))) + GOOGLE_SIGNIN_BONUS;
    const next = {
      ...data,
      tokens,
      googleBonusClaimed: true,
      authProvider: "google" as AuthProvider,
      updatedAt: now,
    };
    tx.set(ref, next, { merge: true });
    return asProfile(uid, next);
  });
}

export function createFirestoreRepo(db: Firestore): SocialRepo {
  return {
    async ensureProfile(uid, seed, google) {
      const snap = await getDoc(userRef(db, uid));
      if (snap.exists()) {
        const profile = asProfile(uid, snap.data());
        // Mevcut profilde ismi yeniden üretme; yalnızca rezervasyon yoksa dene.
        try {
          await claimDisplayName(db, uid, profile.displayName);
        } catch {
          /* isim zaten sende veya kilitli — profil adını değiştirme */
        }
        if (google) return grantGoogleBonus(db, uid);
        return profile;
      }
      const now = Date.now();
      const wanted = seed?.displayName ? normalizeDisplayName(seed.displayName) : "";
      let displayName: string;
      if (wanted) {
        try {
          await claimDisplayName(db, uid, wanted);
          displayName = wanted;
        } catch {
          displayName = await allocateGuestName(db, uid);
        }
      } else {
        displayName = await allocateGuestName(db, uid);
      }
      const profile: UserProfile = {
        uid,
        displayName,
        avatarId: sanitizeAvatarId(seed?.avatarId ?? DEFAULT_AVATAR),
        friendCode: await uniqueFriendCode(db),
        tokens: 0,
        googleBonusClaimed: false,
        authProvider: "guest",
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(userRef(db, uid), profile);
      if (google) return grantGoogleBonus(db, uid);
      return profile;
    },

    async saveProfile(profile) {
      const prevSnap = await getDoc(userRef(db, profile.uid));
      const previous = prevSnap.exists() ? asProfile(profile.uid, prevSnap.data()) : profile;
      const displayName = normalizeDisplayName(profile.displayName) || previous.displayName;
      await claimDisplayName(db, profile.uid, displayName, previous.displayName);
      const next: UserProfile = {
        ...previous,
        ...profile,
        displayName,
        avatarId: sanitizeAvatarId(profile.avatarId),
        tokens: previous.tokens,
        googleBonusClaimed: previous.googleBonusClaimed,
        authProvider: previous.authProvider,
        updatedAt: Date.now(),
      };
      await setDoc(userRef(db, next.uid), next, { merge: true });
      return next;
    },

    async applyGoogleAccount(uid) {
      return grantGoogleBonus(db, uid);
    },

    async spendTokens(uid, amount) {
      if (amount <= 0) {
        const snap = await getDoc(userRef(db, uid));
        if (!snap.exists()) throw new Error("Profil bulunamadı.");
        return asProfile(uid, snap.data());
      }
      const ref = userRef(db, uid);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Profil bulunamadı.");
        const data = snap.data();
        const tokens = Math.max(0, Math.floor(Number(data.tokens ?? 0)));
        if (tokens < amount) throw new Error("Yeterli jetonun yok.");
        const next = { ...data, tokens: tokens - amount, updatedAt: Date.now() };
        tx.set(ref, next, { merge: true });
        return asProfile(uid, next);
      });
    },

    watchFriends(uid, cb) {
      return onSnapshot(collection(db, "users", uid, "friends"), (snap) => {
        cb(snap.docs.map((d) => d.data() as FriendDoc));
      });
    },

    watchIncoming(uid, cb) {
      return onSnapshot(collection(db, "users", uid, "incoming"), (snap) => {
        cb(snap.docs.map((d) => d.data() as IncomingRequest));
      });
    },

    async findByFriendCode(code) {
      const q = query(
        collection(db, "users"),
        where("friendCode", "==", code.trim().toUpperCase()),
        limit(1),
      );
      const snap = await getDocs(q);
      const row = snap.docs[0];
      if (!row) return null;
      return asProfile(row.id, row.data());
    },

    async sendRequest(from, to) {
      if (from.uid === to.uid) throw new Error("Kendini arkadaş ekleyemezsin.");
      const already = await getDoc(doc(db, "users", from.uid, "friends", to.uid));
      if (already.exists()) throw new Error("Zaten arkadaşsınız.");
      const pending = await getDoc(doc(db, "users", to.uid, "incoming", from.uid));
      if (pending.exists()) throw new Error("İstek zaten gönderildi.");
      const batch = writeBatch(db);
      batch.set(doc(db, "users", to.uid, "incoming", from.uid), {
        fromUid: from.uid,
        fromName: from.displayName,
        fromAvatar: from.avatarId,
        createdAt: Date.now(),
      } satisfies IncomingRequest);
      batch.set(doc(db, "users", from.uid, "outgoing", to.uid), {
        toUid: to.uid,
        toName: to.displayName,
        toAvatar: to.avatarId,
        createdAt: Date.now(),
      });
      await batch.commit();
    },

    async acceptRequest(me, incoming) {
      const batch = writeBatch(db);
      const since = Date.now();
      batch.set(doc(db, "users", me.uid, "friends", incoming.fromUid), {
        uid: incoming.fromUid,
        displayName: incoming.fromName,
        avatarId: incoming.fromAvatar,
        since,
      } satisfies FriendDoc);
      batch.set(doc(db, "users", incoming.fromUid, "friends", me.uid), {
        uid: me.uid,
        displayName: me.displayName,
        avatarId: me.avatarId,
        since,
      } satisfies FriendDoc);
      batch.delete(doc(db, "users", me.uid, "incoming", incoming.fromUid));
      batch.delete(doc(db, "users", incoming.fromUid, "outgoing", me.uid));
      await batch.commit();
    },

    async declineRequest(meUid, fromUid) {
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", meUid, "incoming", fromUid));
      batch.delete(doc(db, "users", fromUid, "outgoing", meUid));
      await batch.commit();
    },

    async removeFriend(meUid, friendUid) {
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", meUid, "friends", friendUid));
      batch.delete(doc(db, "users", friendUid, "friends", meUid));
      await batch.commit();
    },
  };
}
