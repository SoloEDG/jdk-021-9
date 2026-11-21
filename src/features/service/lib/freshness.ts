import type { Dish, Game } from "../../../shared/types";
export function servingQuality(g: Game, d: Dish) {
  return Math.max(
    0,
    d.quality - Math.floor(Math.max(0, g.time - d.cookedAt - 15) * 2),
  );
}
export function servicePair(g: Game) {
  return {
    dish: g.dishes.find((d) => d.id === g.selectedDish),
    order: g.orders.find(
      (o) => o.id === g.selectedOrder && o.status === "accepted",
    ),
  };
}
