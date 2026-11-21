import type { Game } from "../shared/types";
import { expire, arrive } from "../features/orders";
import { closeShift } from "../features/ledger";

/**
 * 推进一个 0.1s 营业节拍：时间前进、超时离店、自动到客、到点打烊。
 * 返回本拍是否触发了打烊。
 *
 * 这是纯状态演进，不含任何存档副作用（历史最佳的写入留在
 * 真实对局的 session 里），因此实时对局与回放模拟共用本函数，
 * 保证两条路径的行为完全一致。
 */
export function stepTick(g: Game): boolean {
  g.time = Math.min(g.duration, Math.round((g.time + 0.1) * 10) / 10);
  expire(g);
  if (Math.round(g.time * 10) % 180 === 0) arrive(g);
  if (g.time >= g.duration) {
    closeShift(g);
    return true;
  }
  return false;
}
