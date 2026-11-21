import type { Game } from "./types";
export function createGame(best = 0): Game {
  return {
    time: 0,
    duration: 180,
    running: false,
    ended: false,
    nextId: 4,
    selectedOrder: null,
    selectedDish: null,
    orders: [
      {
        id: 1,
        recipe: "steak",
        guest: "林小姐",
        arrived: 0,
        deadline: 65,
        status: "waiting",
      },
      {
        id: 2,
        recipe: "pasta",
        guest: "周先生",
        arrived: 0,
        deadline: 75,
        status: "waiting",
      },
      {
        id: 3,
        recipe: "salad",
        guest: "小陈",
        arrived: 0,
        deadline: 55,
        status: "waiting",
      },
    ],
    stock: { beef: 5, noodle: 5, greens: 6 },
    portions: [],
    stoves: [
      { id: 1, kind: "pan", portion: null, started: 0 },
      { id: 2, kind: "pan", portion: null, started: 0 },
      { id: 3, kind: "pot", portion: null, started: 0 },
    ],
    dishes: [],
    entries: [],
    combo: 0,
    served: 0,
    missed: 0,
    notice: "准备好了吗？开门迎接第一位客人。",
    best,
  };
}
