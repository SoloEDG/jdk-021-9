import type { Game, RecipeId } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
export function preparationIssue(g: Game, r: RecipeId): string {
  if (g.portions.length >= 6) return "备料台已满（6份）";
  if (g.stock[recipes[r].ingredient] < 1) return "食材不足，请采购";
  return "";
}
