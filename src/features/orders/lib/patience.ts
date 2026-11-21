import type { Game, Order } from "../../../shared/types";
export function patience(g: Game, o: Order) {
  return Math.max(
    0,
    Math.min(1, (o.deadline - g.time) / (o.deadline - o.arrived)),
  );
}
export function activeOrders(g: Game) {
  return g.orders.filter(
    (o) => o.status === "waiting" || o.status === "accepted",
  );
}
