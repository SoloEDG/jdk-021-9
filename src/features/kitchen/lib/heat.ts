import type { RecipeId, Game, Stove } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
export function quality(recipe: RecipeId, elapsed: number) {
  const target = recipes[recipe].target;
  return Math.max(0, Math.round(100 - Math.abs(elapsed - target) * 12));
}
export function heatLabel(g: Game, s: Stove) {
  if (!s.portion) return "空闲";
  const t = g.time - s.started,
    ideal = recipes[s.portion.recipe].target;
  return t < ideal - 2 ? "烹饪中" : t <= ideal + 2 ? "最佳火候" : "即将焦糊";
}
