import type { Recipe, RecipeId, Ingredient } from "./types";
export const recipes: Record<RecipeId, Recipe> = {
  steak: {
    id: "steak",
    name: "香煎牛排",
    icon: "🥩",
    ingredient: "beef",
    station: "pan",
    target: 12,
    price: 48,
  },
  pasta: {
    id: "pasta",
    name: "奶油意面",
    icon: "🍝",
    ingredient: "noodle",
    station: "pot",
    target: 10,
    price: 36,
  },
  salad: {
    id: "salad",
    name: "温蔬沙拉",
    icon: "🥗",
    ingredient: "greens",
    station: "pan",
    target: 6,
    price: 28,
  },
};
export const ingredients: Record<
  Ingredient,
  { name: string; icon: string; cost: number }
> = {
  beef: { name: "牛肉", icon: "🥩", cost: 12 },
  noodle: { name: "面条", icon: "🍜", cost: 7 },
  greens: { name: "时蔬", icon: "🥬", cost: 5 },
};
export const recipeList = Object.values(recipes);
