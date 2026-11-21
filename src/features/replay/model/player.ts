import { reactive } from "vue";
import type { Game } from "../../../shared/types";
import { nearestCheckpoint, simulateChunked, simulateSync } from "./simulator";
import { quantize, type ReplayEvent } from "./events";
import type { ReplayStore, Timeline } from "./timeline";

const EPS = 1e-9;

export interface ReplayView {
  timelineId: string | null;
  /** 当前停在哪个时刻。 */
  time: number;
  /** 该时刻还原出的状态（库存 / 设备 / 订单 / 账本）。 */
  state: Game | null;
  /** 截止当前时刻已发生的事件。 */
  events: ReplayEvent[];
  /** 正在分段恢复中。 */
  restoring: boolean;
  /** 恢复进度 0..1。 */
  progress: number;
}

export interface PlayerOptions {
  chunkTicks?: number;
  yieldControl?: () => Promise<void>;
}

/**
 * 回放播放器：拖动时间轴时从最近检查点分段恢复状态。
 *
 * 每次恢复都绑定一个纪元号（epoch）：用户切换回放或继续拖动时
 * 纪元号递增，进行中的旧恢复在下一次让出控制权时发现纪元失效
 * 便自动放弃 —— 迟到的恢复结果绝不会覆盖更新的选择。
 */
export class ReplayPlayer {
  readonly view: ReplayView;
  private epoch = 0;
  private readonly store: ReplayStore;
  private readonly opts: PlayerOptions;

  constructor(store: ReplayStore, opts: PlayerOptions = {}) {
    this.store = store;
    this.opts = opts;
    this.view = reactive<ReplayView>({
      timelineId: null,
      time: 0,
      state: null,
      events: [],
      restoring: false,
      progress: 0,
    });
  }

  /** 选中一条回放并恢复到开局。 */
  async open(timelineId: string): Promise<void> {
    const tl = this.store.byId(timelineId);
    if (!tl) return;
    this.view.timelineId = timelineId;
    this.view.state = null;
    this.view.events = [];
    await this.restore(tl, 0);
  }

  /** 拖动到任意时刻。 */
  async seek(time: number): Promise<void> {
    const id = this.view.timelineId;
    const tl = id ? this.store.byId(id) : undefined;
    if (!tl) return;
    await this.restore(tl, quantize(time));
  }

  close(): void {
    this.epoch++;
    this.view.timelineId = null;
    this.view.state = null;
    this.view.events = [];
    this.view.restoring = false;
  }

  private async restore(tl: Timeline, t: number): Promise<void> {
    const epoch = ++this.epoch;
    this.view.restoring = true;
    this.view.progress = 0;
    try {
      const cp = nearestCheckpoint(tl.checkpoints, t);
      const result = await simulateChunked(tl.script, {
        until: t,
        from: cp,
        initialBest: tl.initialBest,
        duration: tl.duration,
        chunkTicks: this.opts.chunkTicks,
        yieldControl: this.opts.yieldControl,
        shouldAbort: () => this.epoch !== epoch,
        onChunk: (done, total) => {
          if (this.epoch === epoch) this.view.progress = done / total;
        },
      });
      // 纪元失效：结果迟到，直接丢弃，不覆盖更新的选择。
      if (result === null || this.epoch !== epoch) return;
      this.view.state = result.state;
      this.view.time = t;
      this.view.events = tl.events.filter((e) => e.t <= t + EPS);
      this.view.progress = 1;
    } finally {
      if (this.epoch === epoch) this.view.restoring = false;
    }
  }
}

/** 便于测试与界面直接使用的同步还原（不分段）。 */
export function restoreAt(tl: Timeline, t: number): Game {
  const cp = nearestCheckpoint(tl.checkpoints, t);
  return simulateSync(tl.script, {
    until: t,
    from: cp,
    initialBest: tl.initialBest,
    duration: tl.duration,
  }).state;
}
