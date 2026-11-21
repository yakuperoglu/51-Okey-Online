import { leftoverValue } from "./tiles.js";
import type { FinishInfo, GameConfig, PlayerState } from "./types.js";

export function finishMultiplier(withOkey: boolean, withPairs: boolean): number {
  if (withOkey && withPairs) return 4;
  if (withOkey || withPairs) return 2;
  return 1;
}

export function winnerDelta(config: GameConfig, withOkey: boolean, withPairs: boolean): number {
  return -(config.penalty * finishMultiplier(withOkey, withPairs));
}

export function loserDelta(
  player: PlayerState,
  config: GameConfig,
  finish: Pick<FinishInfo, "withOkey" | "withPairs">,
): number {
  // Okey finish and pairs finish both double what everyone else pays (x4 together).
  const okeyMul = finishMultiplier(finish.withOkey, finish.withPairs);

  if (!player.opened) return config.penalty * okeyMul;

  const remain = player.hand.reduce((sum, t) => sum + leftoverValue(t), 0);

  if (player.goingPairs) {
    return remain * 2 * okeyMul;
  }

  return remain * okeyMul;
}

export function applyRoundScores(
  players: PlayerState[],
  winnerId: string,
  config: GameConfig,
  withOkey: boolean,
  withPairs: boolean,
): { players: PlayerState[]; finish: FinishInfo } {
  const winnerDeltaScore = winnerDelta(config, withOkey, withPairs);
  const finish: FinishInfo = {
    winnerId,
    withOkey,
    withPairs,
    multiplier: finishMultiplier(withOkey, withPairs),
    winnerDelta: winnerDeltaScore,
  };

  const wIdx = players.findIndex((p) => p.id === winnerId);
  const partnerId =
    config.pairing === "ciftli" && wIdx >= 0 ? players[(wIdx + 2) % 4]?.id : undefined;

  const next = players.map((p) => {
    if (p.id === winnerId || p.id === partnerId) {
      return { ...p, score: p.score + winnerDeltaScore };
    }
    return { ...p, score: p.score + loserDelta(p, config, finish) };
  });

  return { players: next, finish };
}

/** Hand closed without a winner (draw pile exhausted): everyone pays their own leftovers. */
export function applyNoWinnerScores(players: PlayerState[], config: GameConfig): PlayerState[] {
  return players.map((p) => ({
    ...p,
    score: p.score + loserDelta(p, config, { withOkey: false, withPairs: false }),
  }));
}
