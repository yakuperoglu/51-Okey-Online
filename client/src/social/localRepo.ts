import type { FriendDoc, IncomingRequest, SocialRepo, UserProfile } from "./types";
import { DEFAULT_AVATAR, sanitizeAvatarId } from "./avatars";
import { makeFriendCode } from "./codes";
import { normalizeDisplayName, randomGuestName } from "./guestName";
import { GOOGLE_SIGNIN_BONUS } from "./tokens";

const KEY = {
  profile: "okey-profile",
  friends: "okey-friends",
  incoming: "okey-incoming",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

const listeners = {
  friends: new Set<(v: FriendDoc[]) => void>(),
  incoming: new Set<(v: IncomingRequest[]) => void>(),
};

function emitFriends() {
  const v = Object.values(read<Record<string, FriendDoc>>(KEY.friends, {}));
  listeners.friends.forEach((cb) => cb(v));
}

function emitIncoming() {
  const v = Object.values(read<Record<string, IncomingRequest>>(KEY.incoming, {}));
  listeners.incoming.forEach((cb) => cb(v));
}

export const localRepo: SocialRepo = {
  async ensureProfile(uid, seed, google) {
    const existing = read<UserProfile | null>(KEY.profile, null);
    if (existing && existing.uid === uid) {
      const profile: UserProfile = {
        ...existing,
        avatarId: sanitizeAvatarId(existing.avatarId),
        displayName: existing.displayName.slice(0, 16) || randomGuestName(),
        tokens: existing.tokens ?? 0,
        googleBonusClaimed: existing.googleBonusClaimed ?? false,
        authProvider: existing.authProvider ?? "guest",
      };
      write(KEY.profile, profile);
      if (google) return localRepo.applyGoogleAccount(uid);
      return profile;
    }
    const now = Date.now();
    const profile: UserProfile = {
      uid,
      displayName: seed?.displayName?.slice(0, 16) || existing?.displayName || randomGuestName(),
      avatarId: sanitizeAvatarId(seed?.avatarId ?? existing?.avatarId ?? DEFAULT_AVATAR),
      friendCode: existing?.friendCode || makeFriendCode(),
      tokens: existing?.tokens ?? 0,
      googleBonusClaimed: existing?.googleBonusClaimed ?? false,
      authProvider: existing?.authProvider ?? "guest",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    write(KEY.profile, profile);
    if (google) return localRepo.applyGoogleAccount(uid);
    return profile;
  },

  async saveProfile(profile) {
    const prev = read<UserProfile | null>(KEY.profile, null);
    const next: UserProfile = {
      ...profile,
      displayName: normalizeDisplayName(profile.displayName) || prev?.displayName || randomGuestName(),
      avatarId: sanitizeAvatarId(profile.avatarId),
      tokens: prev?.tokens ?? profile.tokens ?? 0,
      googleBonusClaimed: prev?.googleBonusClaimed ?? profile.googleBonusClaimed ?? false,
      authProvider: prev?.authProvider ?? profile.authProvider ?? "guest",
      updatedAt: Date.now(),
    };
    write(KEY.profile, next);
    return next;
  },

  async applyGoogleAccount(uid) {
    const existing = read<UserProfile | null>(KEY.profile, null);
    if (!existing || existing.uid !== uid) throw new Error("Profil bulunamadı.");
    if (existing.googleBonusClaimed) {
      const next = { ...existing, authProvider: "google" as const, updatedAt: Date.now() };
      write(KEY.profile, next);
      return next;
    }
    const next: UserProfile = {
      ...existing,
      tokens: (existing.tokens ?? 0) + GOOGLE_SIGNIN_BONUS,
      googleBonusClaimed: true,
      authProvider: "google",
      updatedAt: Date.now(),
    };
    write(KEY.profile, next);
    return next;
  },

  async spendTokens(uid, amount) {
    const existing = read<UserProfile | null>(KEY.profile, null);
    if (!existing || existing.uid !== uid) throw new Error("Profil bulunamadı.");
    if (amount <= 0) return existing;
    if ((existing.tokens ?? 0) < amount) throw new Error("Yeterli jetonun yok.");
    const next = { ...existing, tokens: existing.tokens - amount, updatedAt: Date.now() };
    write(KEY.profile, next);
    return next;
  },

  watchFriends(_uid, cb) {
    listeners.friends.add(cb);
    cb(Object.values(read<Record<string, FriendDoc>>(KEY.friends, {})));
    return () => {
      listeners.friends.delete(cb);
    };
  },

  watchIncoming(_uid, cb) {
    listeners.incoming.add(cb);
    cb(Object.values(read<Record<string, IncomingRequest>>(KEY.incoming, {})));
    return () => {
      listeners.incoming.delete(cb);
    };
  },

  async findByFriendCode(code) {
    const me = read<UserProfile | null>(KEY.profile, null);
    if (me && me.friendCode === code.trim().toUpperCase()) return me;
    return null;
  },

  async sendRequest(from, to) {
    if (from.uid === to.uid) throw new Error("Kendini arkadaş ekleyemezsin.");
    const friends = read<Record<string, FriendDoc>>(KEY.friends, {});
    if (friends[to.uid]) throw new Error("Zaten arkadaşsınız.");
    const incoming = read<Record<string, IncomingRequest>>(KEY.incoming, {});
    incoming[from.uid] = {
      fromUid: from.uid,
      fromName: from.displayName,
      fromAvatar: from.avatarId,
      createdAt: Date.now(),
    };
    write(KEY.incoming, incoming);
    emitIncoming();
  },

  async acceptRequest(_me, incoming) {
    const friends = read<Record<string, FriendDoc>>(KEY.friends, {});
    friends[incoming.fromUid] = {
      uid: incoming.fromUid,
      displayName: incoming.fromName,
      avatarId: incoming.fromAvatar,
      since: Date.now(),
    };
    write(KEY.friends, friends);
    const reqs = read<Record<string, IncomingRequest>>(KEY.incoming, {});
    delete reqs[incoming.fromUid];
    write(KEY.incoming, reqs);
    emitFriends();
    emitIncoming();
  },

  async declineRequest(_meUid, fromUid) {
    const reqs = read<Record<string, IncomingRequest>>(KEY.incoming, {});
    delete reqs[fromUid];
    write(KEY.incoming, reqs);
    emitIncoming();
  },

  async removeFriend(_meUid, friendUid) {
    const friends = read<Record<string, FriendDoc>>(KEY.friends, {});
    delete friends[friendUid];
    write(KEY.friends, friends);
    emitFriends();
  },
};
