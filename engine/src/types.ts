export type TileColor = "yellow" | "red" | "black" | "blue";

export type TileKind = "normal" | "fakeOkey" | "wildOkey";

export interface Tile {
  id: string;
  color: TileColor;
  value: number;
  kind: TileKind;
  /** Sahte okey, gösterge sonrası okey numarasına dönüşünce true kalır. */
  wasFakeOkey?: boolean;
}

export interface OkeyIdentity {
  color: TileColor;
  value: number;
}

export type MeldType = "series" | "set" | "pair";

export interface OkeySub {
  color: TileColor;
  value: number;
}

export interface TableMeld {
  id: string;
  type: MeldType;
  ownerId: string;
  tiles: Tile[];
  color?: TileColor;
  values?: number[];
  wrap?: boolean;
  setValue?: number;
  okeyAs: Record<string, OkeySub>;
  /** Taş id -> masaya koyan oyuncu. Açılışta owner, işlenince işleyen. */
  addedBy?: Record<string, string>;
}

export interface ValidatedMeld {
  type: MeldType;
  tiles: Tile[];
  points: number;
  color?: TileColor;
  values?: number[];
  wrap?: boolean;
  setValue?: number;
  okeyAs: Record<string, OkeySub>;
}

export interface PlayerState {
  id: string;
  name: string;
  avatarId?: string;
  isBot: boolean;
  connected: boolean;
  hand: Tile[];
  discard: Tile[];
  opened: boolean;
  goingPairs: boolean;
  score: number;
  lastPenalty?: string;
}

export type TurnPhase = "draw" | "play";
export type GamePhase = "playing" | "roundEnd";

export interface FinishInfo {
  winnerId: string;
  withOkey: boolean;
  withPairs: boolean;
  multiplier: number;
  winnerDelta: number;
}

export interface GameEvent {
  id: string;
  text: string;
  kind: "info" | "open" | "penalty" | "finish" | "process";
}

export interface GameConfig {
  minPairs: number;
  potContribution: number;
  penalty: number;
  ruleset: "normal" | "kanli";
  pairing: "tekli" | "ciftli";
}

export interface GameState {
  config: GameConfig;
  round: number;
  phase: GamePhase;
  starterIndex: number;
  currentIndex: number;
  turn: {
    hasDrawn: boolean;
    mustUseTileId: string | null;
    tookDiscard: boolean;
  };
  indicator: Tile;
  okey: OkeyIdentity;
  drawPile: Tile[];
  players: PlayerState[];
  tableMelds: TableMeld[];
  pot: number;
  events: GameEvent[];
  finish: FinishInfo | null;
  meldSeq: number;
  eventSeq: number;
}

export type GameAction =
  | { type: "drawPile" }
  | { type: "drawDiscard" }
  | { type: "open"; groups: string[][]; goingPairs: boolean }
  | {
      type: "process";
      tileId: string;
      meldId: string;
      place: "left" | "right" | "append" | "swapOkey";
    }
  | { type: "discard"; tileId: string }
  | { type: "nextRound" };

export interface ActionResult {
  ok: boolean;
  error?: string;
  state: GameState;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatarId?: string;
  isBot: boolean;
  connected: boolean;
  tileCount: number;
  opened: boolean;
  goingPairs: boolean;
  score: number;
  discard: Tile[];
  lastPenalty?: string;
}

export interface ClientGameState {
  round: number;
  phase: GamePhase;
  starterIndex: number;
  currentIndex: number;
  currentPlayerId: string;
  yourId: string;
  yourIndex: number;
  isYourTurn: boolean;
  turn: GameState["turn"];
  indicator: Tile;
  okey: OkeyIdentity;
  drawPileCount: number;
  players: PublicPlayer[];
  tableMelds: TableMeld[];
  pot: number;
  events: GameEvent[];
  finish: FinishInfo | null;
  yourHand: Tile[];
  config: GameConfig;
}

export const COLORS: TileColor[] = ["yellow", "red", "black", "blue"];

export const COLOR_TR: Record<TileColor, string> = {
  yellow: "Sarı",
  red: "Kırmızı",
  black: "Siyah",
  blue: "Mavi",
};

export const DEFAULT_CONFIG: GameConfig = {
  minPairs: 4,
  potContribution: 10,
  penalty: 101,
  ruleset: "kanli",
  pairing: "tekli",
};
