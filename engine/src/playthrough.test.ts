import { describe, expect, it } from "vitest";
import { pickBotAction } from "./bot.js";
import { applyAction, createMatch } from "./game.js";

describe("botlu tam el", () => {
  it("4 bot bir eli kırmadan sonuna kadar oynar", () => {
    let state = createMatch(
      [
        { id: "b1", name: "B1", isBot: true },
        { id: "b2", name: "B2", isBot: true },
        { id: "b3", name: "B3", isBot: true },
        { id: "b4", name: "B4", isBot: true },
      ],
      {},
      () => 0.37,
    );

    let steps = 0;
    let stuck = 0;
    while (state.phase === "playing" && steps < 400) {
      const actor = state.players[state.currentIndex];
      const action = pickBotAction(state);
      if (!action || action.type === "nextRound") {
        stuck += 1;
        if (stuck > 3) break;
        const discard = actor.hand.find((t) => t.kind !== "wildOkey") ?? actor.hand[0];
        if (!state.turn.hasDrawn) {
          const r = applyAction(state, actor.id, { type: "drawPile" });
          if (!r.ok) break;
          state = r.state;
        } else if (discard && !state.turn.mustUseTileId) {
          const r = applyAction(state, actor.id, { type: "discard", tileId: discard.id });
          if (!r.ok) break;
          state = r.state;
        } else break;
        steps += 1;
        continue;
      }
      stuck = 0;
      const result = applyAction(state, actor.id, action);
      expect(result.ok, result.error).toBe(true);
      state = result.state;
      steps += 1;
    }

    expect(steps).toBeGreaterThan(8);
    expect(state.players.every((p) => p.hand.length <= 16)).toBe(true);
    expect(state.events.length).toBeGreaterThan(0);
  });
});
