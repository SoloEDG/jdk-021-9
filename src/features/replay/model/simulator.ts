import type { Game } from "../../../shared/types";
import { createGame } from "../../../shared/initial";
import { dispatch } from "../../../app/commands";
import { stepTick } from "../../../app/tick";
import { cloneGame } from "../lib/clone";
import { Recorder } from "./recorder";
import {
  compareCommands,
  quantize,
  type ReplayEvent,
  type TimedCommand,
} from "./events";

/** 状态检查点：某一时刻的完整状态快照，用于长局的分段恢复。 */
export interface Checkpoint {
  t: number;
  /** 该检查点之后下一个事件的 seq（保证续跑时序号连续）。 */
  eventSeq: number;
  state: Game;
}

export interface SimResult {
  state: Game;
  events: ReplayEvent[];
}

export interface SimOptions {
  /** 目标时刻（含该时刻的指令），默认一路跑到打烊。 */
  until?: number;
  /** 从最近的检查点续跑，避免从头模拟。 */
  from?: Checkpoint | null;
  /** 开局时的历史最佳（closeShift 会把它并入状态，但不写存档）。 */
  initialBest?: number;
  duration?: number;
}

const EPS = 1e-9;

interface Simulation {
  readonly state: Game;
  readonly events: ReplayEvent[];
  readonly until: number;
  readonly eventSeq: number;
  /** 推进一个节拍（含该时刻的指令）。返回是否已到达目标。 */
  step(): boolean;
}

/**
 * 构造一个确定性模拟：从检查点（或开局）出发，按 (t, seq) 顺序
 * 应用指令脚本，节拍逻辑与实时对局完全共用。
 */
function createSimulation(script: TimedCommand[], opts: SimOptions): Simulation {
  const from = opts.from ?? null;
  const g = from ? cloneGame(from.state) : createGame(opts.initialBest ?? 0);
  if (!from) {
    g.running = true; // 模拟从开门状态开始，指令才会被采纳
    if (opts.duration != null) g.duration = opts.duration;
  }
  const recorder = new Recorder({ eventSeq: from?.eventSeq ?? 0 });
  const until = quantize(Math.min(opts.until ?? g.duration, g.duration));
  const fromT = from ? from.t : -Infinity;
  const cmds = script
    .filter((c) => c.t > fromT + EPS && c.t <= until + EPS)
    .sort(compareCommands);
  let ci = 0;
  const applyAt = (t: number) => {
    while (ci < cmds.length && cmds[ci].t <= t + EPS) {
      recorder.observeCommand(g, cmds[ci].cmd, dispatch);
      ci++;
    }
  };
  applyAt(g.time); // 起点时刻的指令（与实时对局顺序一致）
  return {
    state: g,
    events: recorder.events,
    until,
    get eventSeq() {
      return recorder.lastEventSeq;
    },
    step() {
      if (g.ended || g.time >= until - EPS) return true;
      recorder.recordTick(g, stepTick);
      applyAt(g.time);
      return g.ended || g.time >= until - EPS;
    },
  };
}

/** 同步重放到目标时刻。 */
export function simulateSync(script: TimedCommand[], opts: SimOptions = {}): SimResult {
  const sim = createSimulation(script, opts);
  while (!sim.step()) {
    // 一路推进到目标时刻
  }
  return { state: sim.state, events: sim.events };
}

export interface ChunkedOptions extends SimOptions {
  /** 每段最多推进多少拍后让出一次事件循环（长局分段恢复）。 */
  chunkTicks?: number;
  /** 让出控制权的方式，默认 setTimeout(0)；测试可注入手动调度。 */
  yieldControl?: () => Promise<void>;
  /** 纪元失效检查：返回 true 时立即中止，结果作废。 */
  shouldAbort?: () => boolean;
  onChunk?: (doneTicks: number, totalTicks: number) => void;
}

/**
 * 分段异步重放：每推进一段就让出一次事件循环，保持界面响应；
 * 若期间 shouldAbort 成立（例如用户切到了另一条回放），
 * 返回 null —— 迟到的恢复结果绝不被提交。
 */
export async function simulateChunked(
  script: TimedCommand[],
  opts: ChunkedOptions = {},
): Promise<SimResult | null> {
  const sim = createSimulation(script, opts);
  const chunk = Math.max(1, opts.chunkTicks ?? 300);
  const yieldControl =
    opts.yieldControl ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const total = Math.max(1, Math.round((sim.until - sim.state.time) * 10));
  let done = 0;
  if (opts.shouldAbort?.()) return null;
  while (!sim.step()) {
    done++;
    if (done % chunk === 0) {
      opts.onChunk?.(done, total);
      await yieldControl();
      if (opts.shouldAbort?.()) return null;
    }
  }
  if (opts.shouldAbort?.()) return null;
  return { state: sim.state, events: sim.events };
}

/**
 * 为一条时间线构建检查点序列（默认每 10 秒一个），
 * 同时返回完整模拟结果（事件流与终点状态）。
 */
export function buildCheckpoints(
  script: TimedCommand[],
  opts: SimOptions & { interval?: number } = {},
): { checkpoints: Checkpoint[]; result: SimResult } {
  const interval = Math.max(1, Math.round((opts.interval ?? 10) * 10));
  const sim = createSimulation(script, opts);
  const checkpoints: Checkpoint[] = [];
  const snap = () => {
    const last = checkpoints[checkpoints.length - 1];
    if (last && Math.abs(last.t - sim.state.time) < EPS) return;
    checkpoints.push({
      t: sim.state.time,
      eventSeq: sim.eventSeq,
      state: cloneGame(sim.state),
    });
  };
  snap(); // 开局检查点（含 0 时刻的指令）
  while (!sim.step()) {
    if (Math.round(sim.state.time * 10) % interval === 0) snap();
  }
  snap(); // 终点检查点
  return { checkpoints, result: { state: sim.state, events: sim.events } };
}

/** 找到不晚于 t 的最近检查点；strict 时要求严格早于 t；没有则返回 null（从头模拟）。 */
export function nearestCheckpoint(
  checkpoints: Checkpoint[],
  t: number,
  strict = false,
): Checkpoint | null {
  let best: Checkpoint | null = null;
  for (const cp of checkpoints) {
    const ok = strict ? cp.t < t - EPS : cp.t <= t + EPS;
    if (ok && (!best || cp.t > best.t)) best = cp;
  }
  return best;
}
