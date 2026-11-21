import type { Command, Game } from "../../../shared/types";
import { cloneGame, structuralEquals } from "../lib/clone";
import { deriveEvents } from "./observe";
import type { ReplayEvent, TimedCommand } from "./events";

/**
 * 记录器：包在真实对局的指令分发与节拍之外，
 * 把每一步的业务效果记入回放脚本（指令流）与事件流。
 *
 * 关键约定：
 * - 只记录“真的改变了状态”的指令（被拒绝的指令只改提示文案，不进脚本）；
 * - 指令序号与事件序号各自单调递增，同一时刻的多件事顺序稳定；
 * - 记录器本身不改变游戏行为，只是观察。
 */
export class Recorder {
  readonly script: TimedCommand[];
  readonly events: ReplayEvent[];
  private commandSeq: number;
  private eventSeq: number;

  constructor(init?: {
    script?: TimedCommand[];
    events?: ReplayEvent[];
    commandSeq?: number;
    eventSeq?: number;
  }) {
    this.script = init?.script ?? [];
    this.events = init?.events ?? [];
    this.commandSeq = init?.commandSeq ?? 0;
    this.eventSeq = init?.eventSeq ?? 0;
  }

  get lastEventSeq(): number {
    return this.eventSeq;
  }

  get lastCommandSeq(): number {
    return this.commandSeq;
  }

  /**
   * 记录一条指令。dispatch 为真实的指令执行函数。
   * 返回该指令是否被采纳（即是否进入了回放脚本）。
   */
  recordCommand(g: Game, cmd: Command, dispatch: (g: Game, c: Command) => void): boolean {
    const before = cloneGame(g);
    dispatch(g, cmd);
    if (structuralEquals(before, g)) return false;
    this.script.push({ t: before.time, seq: this.commandSeq++, cmd });
    this.events.push(...deriveEvents(before, g, "command", () => this.eventSeq++));
    return true;
  }

  /**
   * 模拟器专用：执行一条已在脚本中的指令并推导事件，但不再重复记录脚本。
   */
  observeCommand(g: Game, cmd: Command, dispatch: (g: Game, c: Command) => void): void {
    const before = cloneGame(g);
    dispatch(g, cmd);
    this.events.push(...deriveEvents(before, g, "command", () => this.eventSeq++));
  }

  /** 记录一个营业节拍（时间推进、到客、超时、打烊）。 */
  recordTick(g: Game, tick: (g: Game) => void): void {
    const before = cloneGame(g);
    tick(g);
    this.events.push(...deriveEvents(before, g, "tick", () => this.eventSeq++));
  }

  /** 清空记录（重新开局时调用）。 */
  reset(): void {
    this.script.length = 0;
    this.events.length = 0;
    this.commandSeq = 0;
    this.eventSeq = 0;
  }
}
