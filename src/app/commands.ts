import type { Game, Command } from "../shared/types";
import { accept, expire } from "../features/orders";
import { prepare, restock } from "../features/pantry";
import { cook, lift } from "../features/kitchen";
import { plate, discard, deliver } from "../features/service";
export function dispatch(g: Game, c: Command) {
  if (!g.running || g.ended) {
    g.notice = "请先开始营业，暂停时不能操作厨房";
    return;
  }
  switch (c.type) {
    case "accept":
      accept(g, c.id);
      break;
    case "select-order":
      if (g.orders.some((o) => o.id === c.id && o.status === "accepted"))
        g.selectedOrder = c.id;
      break;
    case "prepare":
      prepare(g, c.recipe);
      break;
    case "restock":
      restock(g, c.ingredient);
      break;
    case "cook":
      cook(g, c.portion, c.stove);
      break;
    case "lift":
      lift(g, c.id);
      break;
    case "plate":
      plate(g, c.id);
      break;
    case "select-dish":
      if (g.dishes.some((d) => d.id === c.id && d.stage === "plated"))
        g.selectedDish = c.id;
      break;
    case "serve":
      deliver(g);
      expire(g);
      break;
    case "discard":
      discard(g, c.id);
      break;
  }
}
