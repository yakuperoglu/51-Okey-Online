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
  const okeyMul = finish.withOkey ? 2 : 1;

  if (!player.opened) {
    if (finish.withOkey && finish.withPairs) return config.penalty * 4;
    if (finish.withOkey) return config.penalty * 2;
    return config.penalty;
  }

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
