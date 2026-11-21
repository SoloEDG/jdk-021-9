import type { Game } from "../../../shared/types";
export function plate(g: Game, id: number) {
  const d = g.dishes.find((d) => d.id === id);
  if (!d || d.stage !== "counter") return;
  d.stage = "plated";
  g.selectedDish = id;
  g.notice = "装盘完成，请选中订单后上菜";
}
export function discard(g: Game, id: number) {
  if (!g.dishes.some((d) => d.id === id)) return;
  g.dishes = g.dishes.filter((d) => d.id !== id);
  if (g.selectedDish === id) g.selectedDish = null;
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: "丢弃菜品",
    amount: -3,
    kind: "waste",
  });
  g.notice = "已丢弃，浪费成本 ¥3";
}
