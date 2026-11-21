import { reactive, shallowReactive } from "vue";
import type { Command, Game } from "../../../shared/types";
import { dispatch } from "../../../app/commands";
import { stepTick } from "../../../app/tick";
import { cloneGame, stateHash } from "../lib/clone";
import { hashValue } from "../lib/hash";
import { Recorder } from "./recorder";
import {
  buildCheckpoints,
  nearestCheckpoint,
  simulateSync,
  type Checkpoint,
} from "./simulator";
import {
  compareCommands,
  quantize,
  type ReplayEvent,
  type TimedCommand,
} from "./events";

const EPS = 1e-9;

/** 一条可回放的时间线：原始营业记录，或从它分叉出的演练。 */
export interface Timeline {
  id: string;
  name: string;
  /** 父时间线 id；原始回放为 null。 */
  parentId: string | null;
  /** 分叉点时刻；原始回放为 null。 */
  forkAt: number | null;
  /** 开局时的历史最佳（仅作为状态的一部分被还原，不会写存档）。 */
  initialBest: number;
  duration: number;
  /** 指令脚本：重模拟的唯一输入。 */
  script: TimedCommand[];
  /** 由脚本确定性推出的事件流（接单/备料/下锅/起锅/装盘/上菜/到客/离店…）。 */
  events: ReplayEvent[];
  /** 分段恢复用的检查点。 */
  checkpoints: Checkpoint[];
  /** 打烊时的完整状态。 */
  final: Game;
  finalHash: string;
  traceHash: string;
  createdAt: number;
}

export interface ReplayStore {
  timelines: Timeline[];
  byId(id: string): Timeline | undefined;
  add(t: Timeline): void;
  remove(id: string): void;
}

export function createReplayStore(): ReplayStore {
  const timelines = shallowReactive<Timeline[]>([]);
  return {
    timelines: timelines as Timeline[],
    byId: (id) => timelines.find((t) => t.id === id),
    add: (t) => {
      timelines.push(t);
    },
    remove: (id) => {
      const i = timelines.findIndex((t) => t.id === id);
      if (i >= 0) timelines.splice(i, 1);
    },
  };
}

let timelineCounter = 0;
function nextTimelineId(): string {
  timelineCounter += 1;
  return `tl_${Date.now().toString(36)}_${timelineCounter}`;
}

export interface BuildTimelineOptions {
  id?: string;
  name: string;
  parentId?: string | null;
  forkAt?: number | null;
  initialBest: number;
  duration: number;
  script: TimedCommand[];
  interval?: number;
}

/**
 * 由指令脚本构建完整时间线：重模拟一遍，得到事件流、
 * 检查点与终点指纹。这是回放、分叉与导入校验共用的构建入口。
 */
export function buildTimeline(opts: BuildTimelineOptions): Timeline {
  const script = [...opts.script].sort(compareCommands);
  const { checkpoints, result } = buildCheckpoints(script, {
    initialBest: opts.initialBest,
    duration: opts.duration,
    interval: opts.interval,
  });
  return {
    id: opts.id ?? nextTimelineId(),
    name: opts.name,
    parentId: opts.parentId ?? null,
    forkAt: opts.forkAt ?? null,
    initialBest: opts.initialBest,
    duration: opts.duration,
    script,
    events: result.events,
    checkpoints,
    final: cloneGame(result.state),
    finalHash: stateHash(result.state),
    traceHash: hashValue(result.events.map((e) => [e.t, e.seq, e.type, e.data])),
    createdAt: Date.now(),
  };
}

/**
 * 分叉演练会话：从父时间线的某一时刻出发，只沿新的决定推进。
 *
 * 关键约束：
 * - 父时间线永远不被修改（原回放完整保留）；
 * - 分叉点之后的未来只由演练者的新指令与确定性的时间事件构成，
 *   原时间线里分叉点之后的指令（包括已经交付的上菜记录）一律不带入，
 *   因此绝不可能混用原时间线里已经失效的交付。
 */
export class DrillSession {
  /** 演练用的沙盒状态（reactive，供界面直接绑定）。 */
  readonly state: Game;
  readonly forkAt: number;
  private readonly recorder: Recorder;
  private readonly parent: Timeline;
  private readonly name: string;

  constructor(parent: Timeline, forkAt: number, name?: string) {
    this.parent = parent;
    this.forkAt = quantize(forkAt);
    this.name =
      name ?? `演练 · 从 ${parent.name} 的 ${this.forkAt.toFixed(1)}s 分叉`;
    // 只继承分叉点之前的指令；原时间线在此之后的决定全部作废。
    const prefix: TimedCommand[] = parent.script
      .filter((c) => c.t < this.forkAt - EPS)
      .map((c) => ({ ...c, cmd: { ...c.cmd } }));
    // 借助检查点快速恢复到分叉点，而不是从头模拟。
    // 注意必须取严格早于分叉点的检查点：晚于等于分叉点的检查点
    // 可能已经包含了原时间线在分叉点上的指令（如那次起锅），
    // 而分叉后这些决定一律作废。
    const cp = nearestCheckpoint(parent.checkpoints, this.forkAt, true);
    const base = simulateSync(prefix, {
      until: this.forkAt,
      from: cp,
      initialBest: parent.initialBest,
      duration: parent.duration,
    });
    // 分叉点之前的事件与父时间线完全一致（确定性重放），直接继承。
    const inheritedEvents: ReplayEvent[] = cp
      ? [
          ...parent.events.filter((e) => e.t <= cp.t + EPS),
          ...base.events,
        ]
      : base.events;
    this.state = reactive(cloneGame(base.state)) as Game;
    this.recorder = new Recorder({
      script: prefix,
      events: inheritedEvents,
      commandSeq: prefix.reduce((m, c) => Math.max(m, c.seq + 1), 0),
      eventSeq: inheritedEvents.reduce((m, e) => Math.max(m, e.seq + 1), 0),
    });
  }

  get time(): number {
    return this.state.time;
  }

  get ended(): boolean {
    return this.state.ended;
  }

  /** 演练中下达一条新决定（接单/备料/下锅/起锅/装盘/上菜/采购…）。 */
  command(cmd: Command): boolean {
    return this.recorder.recordCommand(this.state, cmd, dispatch);
  }

  /** 把演练时间推进到 t（只推进时间与自动事件，不自动做任何决定）。 */
  advanceTo(t: number): void {
    const target = quantize(Math.min(t, this.state.duration));
    while (this.state.time < target - EPS && !this.state.ended) {
      this.recorder.recordTick(this.state, stepTick);
    }
  }

  advanceToEnd(): void {
    this.advanceTo(this.state.duration);
  }

  /** 演练完成：把新时间线固化为可回放、可对比、可导出的记录。 */
  finalize(): Timeline {
    if (!this.state.ended) this.advanceToEnd();
    return buildTimeline({
      name: this.name,
      parentId: this.parent.id,
      forkAt: this.forkAt,
      initialBest: this.parent.initialBest,
      duration: this.parent.duration,
      script: this.recorder.script,
    });
  }
}

/** 从父时间线的 at 时刻分叉出一个演练会话。 */
export function forkTimeline(parent: Timeline, at: number, name?: string): DrillSession {
  return new DrillSession(parent, at, name);
}
