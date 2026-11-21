import type { Game } from "../../../shared/types";
export function totals(g: Game) {
  return {
    net: g.entries.reduce((s, e) => s + e.amount, 0),
    sales: g.entries
      .filter((e) => e.kind === "sale")
      .reduce((s, e) => s + e.amount, 0),
    cost: -g.entries
      .filter((e) => e.amount < 0)
      .reduce((s, e) => s + e.amount, 0),
  };
}
export function grade(g: Game) {
  const n = totals(g).net;
  return n >= 400 ? "S" : n >= 250 ? "A" : n >= 120 ? "B" : "C";
}
