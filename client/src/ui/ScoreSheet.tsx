import { handMultiplier, type ClientGameState } from "@okey/engine";

/** Paper "okey not defteri": one row per hand, individual deltas, team blocks, totals. */
export function ScoreSheet({ state, compact = false }: { state: ClientGameState; compact?: boolean }) {
  const you = state.yourIndex;
  const order = [you, (you + 2) % 4, (you + 1) % 4, (you + 3) % 4];
  const players = order.map((i) => state.players[i]);
  const total = Math.max(state.config.totalRounds, state.history.length);
  const rows = Array.from({ length: total }, (_, k) => {
    const round = k + 1;
    const entry = state.history.find((h) => h.round === round);
    return { round, entry, mult: entry?.multiplier ?? handMultiplier(round) };
  });
  const teamSum = (a: number, b: number) => (players[a]?.score ?? 0) + (players[b]?.score ?? 0);
  const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));
  const label = (idx: number) => (idx === 0 ? "Sen" : (players[idx]?.name ?? ""));
  const lossIds = state.matchResult?.loserTeam;

  return (
    <div className={`notebook${compact ? " compact" : ""}`}>
      <div className="nb-spiral" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <table className="nb-table">
        <thead>
          <tr className="nb-teams">
            <th className="nb-hand" />
            <th colSpan={2} className="nb-team">
              Biz
            </th>
            <th colSpan={2} className="nb-team nb-right">
              Onlar
            </th>
          </tr>
          <tr className="nb-names">
            <th className="nb-hand">El</th>
            {players.map((p, i) => (
              <th key={p?.id ?? i} className={i === 2 ? "nb-right" : ""}>
                {label(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ round, entry, mult }) => {
            const current = !entry && round === state.round && state.phase === "playing";
            return (
              <tr key={round} className={current ? "cur" : ""}>
                <td className="nb-hand">
                  {round} <small>×{mult}</small>
                </td>
                {players.map((p, i) => {
                  const d = entry && p ? entry.deltas[p.id] : undefined;
                  const cls = `${i === 2 ? "nb-right " : ""}${d === undefined ? "" : d < 0 ? "neg" : d > 0 ? "pos" : ""}`;
                  return (
                    <td key={p?.id ?? i} className={cls}>
                      {d === undefined ? "" : fmt(d)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="nb-total">
            <td className="nb-hand">Toplam</td>
            {players.map((p, i) => (
              <td key={p?.id ?? i} className={i === 2 ? "nb-right" : ""}>
                <span className={lossIds && p && lossIds.includes(p.id) ? "lost" : ""}>{p?.score ?? 0}</span>
              </td>
            ))}
          </tr>
          <tr className="nb-teamtotal">
            <td className="nb-hand" />
            <td colSpan={2}>
              Biz: <b>{teamSum(0, 1)}</b>
            </td>
            <td colSpan={2} className="nb-right">
              Onlar: <b>{teamSum(2, 3)}</b>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
