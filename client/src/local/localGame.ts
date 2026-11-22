import {
  applyAction,
  createMatch,
  pickBotAction,
  serializeFor,
  type ClientToServer,
  type GameState,
  type Pairing,
  type RoomView,
  type Ruleset,
  type ServerToClient,
} from "@okey/engine";

/**
 * Offline "server": runs a bot match entirely in the browser and speaks the
 * same ServerToClient / ClientToServer messages as server/src/index.ts, so the
 * UI does not need to know whether it is online or not.
 */

const BOT_NAMES = ["Leyla", "Cem", "Deniz"];
const BOT_AVATARS = ["wolf", "frog", "tiger"];

export interface LocalGameOptions {
  name: string;
  avatarId?: string;
  minPairs?: 4 | 5;
  ruleset?: Ruleset;
  pairing?: Pairing;
  /** Delay before each bot step in ms. Default: random 600-1200. */
  botDelay?: () => number;
  rng?: () => number;
}

export interface LocalGame {
  /** Handle a client message (only gameAction / leaveRoom are meaningful). */
  send(payload: ClientToServer): void;
  /** Stop timers; no further messages are emitted. */
  stop(): void;
  readonly playerId: string;
}

let counter = 0;

export function startLocalGame(opts: LocalGameOptions, emit: (msg: ServerToClient) => void): LocalGame {
  const rng = opts.rng ?? Math.random;
  const botDelay = opts.botDelay ?? (() => 600 + Math.floor(rng() * 600));
  const ruleset: Ruleset = opts.ruleset === "kanli" ? "kanli" : "normal";
  const pairing: Pairing = opts.pairing === "ciftli" ? "ciftli" : "tekli";
  const minPairs: 4 | 5 = opts.minPairs === 5 ? 5 : 4;
  const assist = false; // every table is unassisted
  const playerId = `local-${(++counter).toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
  const humanName = opts.name.trim().slice(0, 16) || "Oyuncu";

  const seats = [
    { id: playerId, name: humanName, avatarId: opts.avatarId, isBot: false },
    ...BOT_NAMES.map((name, i) => ({ id: `bot-local-${i}`, name, avatarId: BOT_AVATARS[i], isBot: true })),
  ];

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let game: GameState = createMatch(
    seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot, avatarId: s.avatarId })),
    { minPairs, ruleset, pairing, assist, potContribution: ruleset === "kanli" ? 10 : 0 },
    rng,
  );

  const room: RoomView = {
    code: "BOT",
    hostId: playerId,
    hostName: humanName,
    started: true,
    minPairs,
    visibility: "private",
    ruleset,
    pairing,
    assist,
    seats: seats.map((s) => ({
      id: s.id,
      name: s.name,
      avatarId: s.avatarId,
      isBot: s.isBot,
      connected: true,
      ready: true,
    })),
  };

  const push = () => {
    if (stopped) return;
    emit({ type: "room", room });
    emit({ type: "game", state: serializeFor(game, playerId) });
  };

  const scheduleBots = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const tick = () => {
      timer = undefined;
      if (stopped || game.phase !== "playing") return;
      const current = game.players[game.currentIndex];
      if (!current.isBot) return;
      const action = pickBotAction(game);
      if (!action || action.type === "nextRound") return;
      const result = applyAction(game, current.id, action, rng);
      if (!result.ok) return;
      game = result.state;
      push();
      timer = setTimeout(tick, botDelay());
    };
    const first = game.players[game.currentIndex];
    if (first?.isBot && game.phase === "playing") timer = setTimeout(tick, botDelay());
  };

  // Mirror the server: joined, then room + game, then bots start thinking.
  emit({ type: "joined", playerId, room });
  push();
  scheduleBots();

  return {
    playerId,
    send(payload) {
      if (stopped) return;
      if (payload.type === "leaveRoom") {
        stop();
        return;
      }
      if (payload.type !== "gameAction") return;
      const result = applyAction(game, playerId, payload.action, rng);
      if (!result.ok) {
        emit({ type: "error", message: result.error ?? "Geçersiz hamle." });
        return;
      }
      game = result.state;
      push();
      scheduleBots();
    },
    stop,
  };

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
}
