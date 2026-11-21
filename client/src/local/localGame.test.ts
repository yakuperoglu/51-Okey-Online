import { describe, expect, it } from "vitest";
import type { ClientGameState, ServerToClient } from "@okey/engine";
import { startLocalGame } from "./localGame";

describe("local bot game", () => {
  it("plays a full round offline with the human auto-playing", async () => {
    let state: ClientGameState | null = null;
    const errors: string[] = [];
    let joined = false;
    let x = 12345;
    const rng = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const game = startLocalGame({ name: "Test", botDelay: () => 0, rng }, (msg: ServerToClient) => {
      if (msg.type === "joined") joined = true;
      if (msg.type === "game") state = msg.state;
      if (msg.type === "error") errors.push(msg.message);
    });
    expect(joined).toBe(true);

    for (let i = 0; i < 3000; i++) {
      const s = state as ClientGameState | null;
      if (s && s.phase === "roundEnd") break;
      if (s && s.isYourTurn) {
        if (!s.turn.hasDrawn) {
          game.send({ type: "gameAction", action: { type: "drawPile" } });
        } else {
          const tile = s.yourHand.find((t) => t.kind !== "wildOkey") ?? s.yourHand[0];
          game.send({ type: "gameAction", action: { type: "discard", tileId: tile.id } });
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }

    const end = state as ClientGameState | null;
    expect(end?.phase).toBe("roundEnd");
    expect(errors).toEqual([]);

    game.send({ type: "gameAction", action: { type: "nextRound" } });
    expect((state as ClientGameState | null)?.round).toBe(2);
    game.send({ type: "leaveRoom" });
  });
});
