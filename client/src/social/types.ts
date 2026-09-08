export type AuthProvider = "guest" | "google";

/** Firestore `users/{uid}` belgesi. */
export interface UserProfile {
  uid: string;
  displayName: string;
  avatarId: string;
  friendCode: string;
  tokens: number;
  googleBonusClaimed: boolean;
  authProvider: AuthProvider;
  createdAt: number;
  updatedAt: number;
}

/** Firestore `users/{uid}/friends/{friendUid}` */
export interface FriendDoc {
  uid: string;
  displayName: string;
  avatarId: string;
  since: number;
}

/** Firestore `users/{uid}/incoming/{fromUid}` */
export interface IncomingRequest {
  fromUid: string;
  fromName: string;
  fromAvatar: string;
  createdAt: number;
}

export type Unsubscribe = () => void;

export interface SocialRepo {
  ensureProfile(uid: string, seed?: Partial<UserProfile>, google?: boolean): Promise<UserProfile>;
  saveProfile(profile: UserProfile): Promise<UserProfile>;
  applyGoogleAccount(uid: string): Promise<UserProfile>;
  spendTokens(uid: string, amount: number): Promise<UserProfile>;
  watchFriends(uid: string, cb: (friends: FriendDoc[]) => void): Unsubscribe;
  watchIncoming(uid: string, cb: (reqs: IncomingRequest[]) => void): Unsubscribe;
  findByFriendCode(code: string): Promise<UserProfile | null>;
  sendRequest(from: UserProfile, to: UserProfile): Promise<void>;
  acceptRequest(me: UserProfile, incoming: IncomingRequest): Promise<void>;
  declineRequest(meUid: string, fromUid: string): Promise<void>;
  removeFriend(meUid: string, friendUid: string): Promise<void>;
}
