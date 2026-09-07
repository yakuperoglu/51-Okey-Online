import type { ClientGameState, GameAction, GameConfig } from "./types.js";

export type Ruleset = GameConfig["ruleset"];
export type Pairing = GameConfig["pairing"];
export type RoomVisibility = "public" | "private";

export type ClientToServer =
  | {
      type: "createRoom";
      name: string;
      avatarId?: string;
      minPairs?: 4 | 5;
      visibility?: RoomVisibility;
      ruleset?: Ruleset;
      pairing?: Pairing;
    }
  | { type: "joinRoom"; code: string; name: string; avatarId?: string }
  | { type: "listRooms" }
  | {
      type: "quickPlay";
      name: string;
      avatarId?: string;
      minPairs?: 4 | 5;
      ruleset?: Ruleset;
      pairing?: Pairing;
    }
  | { type: "leaveQueue" }
  | { type: "addBot" }
  | { type: "fillBots" }
  | { type: "startGame" }
  | { type: "leaveRoom" }
  | { type: "gameAction"; action: GameAction };

export interface RoomSeat {
  id: string;
  name: string;
  avatarId?: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
}

export interface RoomView {
  code: string;
  hostId: string;
  hostName: string;
  seats: RoomSeat[];
  started: boolean;
  minPairs: number;
  visibility: RoomVisibility;
  ruleset: Ruleset;
  pairing: Pairing;
}

export interface PublicRoom {
  code: string;
  hostName: string;
  hostAvatarId?: string;
  seats: number;
  started: boolean;
  minPairs: number;
  ruleset: Ruleset;
  pairing: Pairing;
}

export type ServerToClient =
  | { type: "joined"; playerId: string; room: RoomView }
  | { type: "room"; room: RoomView }
  | { type: "rooms"; rooms: PublicRoom[] }
  | { type: "queue"; waiting: number; need: number }
  | { type: "game"; state: ClientGameState }
  | { type: "error"; message: string };
