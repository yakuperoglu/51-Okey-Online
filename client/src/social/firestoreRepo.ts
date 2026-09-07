import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { DEFAULT_AVATAR, sanitizeAvatarId } from "./avatars";
import { makeFriendCode } from "./codes";
import type { FriendDoc, IncomingRequest, SocialRepo, UserProfile } from "./types";

function userRef(db: Firestore, uid: string) {
  return doc(db, "users", uid);
}

function asProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    displayName: String(data.displayName ?? "Oyuncu").slice(0, 16) || "Oyuncu",
    avatarId: sanitizeAvatarId(String(data.avatarId ?? DEFAULT_AVATAR)),
    friendCode: String(data.friendCode ?? "").toUpperCase(),
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

export function createFirestoreRepo(db: Firestore): SocialRepo {
  return {
    async ensureProfile(uid, seed) {
      const snap = await getDoc(userRef(db, uid));
      if (snap.exists()) return asProfile(uid, snap.data());
      const now = Date.now();
      let friendCode = makeFriendCode();
      for (let i = 0; i < 5; i++) {
        const taken = await getDocs(
          query(collection(db, "users"), where("friendCode", "==", friendCode), limit(1)),
        );
        if (taken.empty) break;
        friendCode = makeFriendCode();
      }
      const profile: UserProfile = {
        uid,
        displayName: seed?.displayName?.slice(0, 16) || "Oyuncu",
        avatarId: sanitizeAvatarId(seed?.avatarId ?? DEFAULT_AVATAR),
        friendCode,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(userRef(db, uid), profile);
      return profile;
    },

    async saveProfile(profile) {
      const next: UserProfile = {
        ...profile,
        displayName: profile.displayName.trim().slice(0, 16) || "Oyuncu",
        avatarId: sanitizeAvatarId(profile.avatarId),
        updatedAt: Date.now(),
      };
      await setDoc(userRef(db, next.uid), next, { merge: true });
      return next;
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
