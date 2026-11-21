import type { Game } from "../../../shared/types";
import { hashValue } from "./hash";

/**
 * 深拷贝整局状态。基于 JSON，可安全拷贝 Vue 的 reactive 代理，
 * 拷贝结果是纯对象，供检查点与模拟器使用。
 */
export function cloneGame(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game;
}

/**
 * 判断两步之间是否发生了“结构性”变化。
 * notice 只是提示文案，不算业务变化 —— 被拒绝的指令只改 notice，
 * 因此不会进入回放脚本。
 */
export function structuralEquals(a: Game, b: Game): boolean {
  return canonicalState(a) === canonicalState(b);
}

/** 去掉易变文案后的规范化状态串，用于相等比较。 */
function canonicalState(g: Game): string {
  const { notice: _notice, ...rest } = g;
  return JSON.stringify(rest);
}

/** 状态指纹：用于导出校验与“还原相同场面”的判定。 */
export function stateHash(g: Game): string {
  return hashValue(g);
}
