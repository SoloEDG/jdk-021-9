import type { Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { servingQuality, servicePair } from "../lib/freshness";
export function deliver(g: Game) {
  const { dish, order } = servicePair(g);
  if (!dish || dish.stage !== "plated" || !order) {
    g.notice = "请选择已装盘菜品和已接订单";
    return;
  }
  if (dish.recipe !== order.recipe) {
    order.deadline = Math.max(g.time, order.deadline - 10);
    g.combo = 0;
    g.notice = "上错菜！客人耐心减少10秒，菜品仍留在出餐台";
    return;
  }
  const q = servingQuality(g, dish);
  if (q < 30) {
    order.deadline = Math.max(g.time, order.deadline - 8);
    g.notice = "品质低于30，客人拒收，耐心减少8秒";
    return;
  }
  g.combo++;
  g.served++;
  order.status = "served";
  const amount =
    Math.round((recipes[dish.recipe].price * q) / 100) +
    Math.min(10, (g.combo - 1) * 2);
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: `${order.guest} · ${recipes[dish.recipe].name}`,
    amount,
    kind: "sale",
    ref: `order:${order.id}`,
  });
  g.dishes = g.dishes.filter((d) => d.id !== dish.id);
  g.selectedDish = null;
  g.selectedOrder = null;
  g.notice = `交付成功 +¥${amount} · 连续交付 ${g.combo} 单`;
}
