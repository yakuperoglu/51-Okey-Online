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
export type GamePhase = "playing" | "roundEnd" | "matchEnd";

export interface FinishInfo {
  winnerId: string;
  withOkey: boolean;
  withPairs: boolean;
  /** Finish factor: 1 normal, 2 okey or pairs, 4 both. */
  multiplier: number;
  /** Hand multiplier (8, 6, 5, 4 cycle) already applied to winnerDelta and all leftovers. */
  handMultiplier: number;
  /** Winner's (and partner's) delta, already multiplied by the hand multiplier. */
  winnerDelta: number;
}

export interface RoundHistoryEntry {
  round: number;
  multiplier: number;
  /** Score change per player id in that hand, including in-hand penalties. */
  deltas: Record<string, number>;
}

export interface MatchResult {
  loserTeam: [string, string];
  winnerTeam: [string, string];
  /** Player with the highest individual total (his team loses). */
  highestPlayerId: string;
  teamTotals: { ids: [string, string]; total: number }[];
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
  assist: boolean;
  /** Number of hands in the match: a multiple of 4 between 4 and 16. */
  totalRounds: number;
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
  /** Scores at the start of the current hand (for history deltas). */
  roundStartScores: Record<string, number>;
  history: RoundHistoryEntry[];
  matchResult: MatchResult | null;
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
  /** Put the just-taken, still unused discard back on the previous player's pile and draw again. */
  | { type: "returnDiscard" }
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
  /** Multiplier of the current hand (8, 6, 5, 4 cycle). */
  handMultiplier: number;
  history: RoundHistoryEntry[];
  matchResult: MatchResult | null;
}

export const COLORS: TileColor[] = ["yellow", "red", "black", "blue"];

export const COLOR_TR: Record<TileColor, string> = {
  yellow: "Sarı",
  red: "Kırmızı",
  black: "Siyah",
  blue: "Mavi",
};

export const DEFAULT_CONFIG: GameConfig = {
  minPairs: 5,
  potContribution: 10,
  penalty: 101,
  ruleset: "kanli",
  pairing: "ciftli",
  assist: false,
  totalRounds: 8,
};
