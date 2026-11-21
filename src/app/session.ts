import { reactive, onUnmounted } from "vue";
import type { Command } from "../shared/types";
import { createGame } from "../shared/initial";
import { saveBest, readBest } from "../features/ledger";
import { stepTick } from "./tick";
import { dispatch } from "./commands";
import {
  Recorder,
  buildTimeline,
  createReplayStore,
  ReplayPlayer,
} from "../features/replay";

export function useSession() {
  const game = reactive(createGame(readBest()));
  // 记录器只观察、不改变游戏行为；打烊后由它沉淀出可回放的时间线。
  const recorder = new Recorder();
  const replayStore = createReplayStore();
  const player = new ReplayPlayer(replayStore);
  let shiftBest = game.best;
  let last = performance.now(),
    carry = 0;

  function finalizeShift() {
    const tl = buildTimeline({
      name: `午市回放 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
      initialBest: shiftBest,
      duration: game.duration,
      script: recorder.script,
    });
    replayStore.add(tl);
  }

  const timer = setInterval(() => {
    const now = performance.now(),
      dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    if (!game.running) return;
    carry += dt;
    while (carry >= 0.1 && game.running) {
      carry -= 0.1;
      recorder.recordTick(game, (g) => {
        // 只有真实对局才会写入历史最佳；回放与演练永不触发。
        if (stepTick(g)) saveBest(g);
      });
      // 打烊事件完整入档后，再把本场沉淀为可回放的时间线。
      if (game.ended) finalizeShift();
    }
  }, 50);
  onUnmounted(() => clearInterval(timer));

  function toggle() {
    if (game.ended) return;
    carry = 0;
    last = performance.now();
    game.running = !game.running;
    game.notice = game.running
      ? "营业中，客人已经入座。"
      : "已暂停，所有厨房计时冻结。";
  }

  /** 真实对局的指令入口：先执行，再把有效指令记入回放脚本。 */
  function runCommand(c: Command) {
    recorder.recordCommand(game, c, dispatch);
  }

  function restart() {
    Object.assign(game, createGame(game.best));
    recorder.reset();
    shiftBest = game.best;
    carry = 0;
    last = performance.now();
  }
  return { game, toggle, restart, runCommand, replayStore, player };
}
