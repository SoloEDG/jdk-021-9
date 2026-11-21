import { describe, expect, it } from "vitest";
import { buildTimeline } from "../model/timeline";
import { restoreAt } from "../model/player";
import { simulateChunked, simulateSync } from "../model/simulator";
import { playShift, STANDARD_PLAY } from "./helpers";

function buildStandard() {
  const played = playShift({ commands: STANDARD_PLAY, duration: 60, snapshotEvery: 5 });
  const timeline = buildTimeline({
    name: "测试回放",
    initialBest: 0,
    duration: 60,
    script: played.recorder.script,
  });
  return { played, timeline };
}

describe("确定性重放", () => {
  it("重模拟的终局与真实对局完全一致（库存/设备/订单/账本）", () => {
    const { played, timeline } = buildStandard();
    expect(timeline.final).toEqual(played.game);
    expect(timeline.final.entries).toHaveLength(played.game.entries.length);
    expect(timeline.final.stock).toEqual(played.game.stock);
  });

  it("重推出的事件流与实况记录逐条一致（含同刻顺序）", () => {
    const { played, timeline } = buildStandard();
    expect(timeline.events).toEqual(played.recorder.events);
  });

  it("拖到任意时刻都能还原当时的库存、设备、订单与账本", () => {
    const { played, timeline } = buildStandard();
    for (const [t, snap] of played.snapshots) {
      const restored = restoreAt(timeline, t);
      expect(restored, `t=${t} 的状态不一致`).toEqual(snap);
    }
    // 抽查几个非整点时刻
    for (const t of [13.5, 24.7, 37.8, 59.9]) {
      const restored = restoreAt(timeline, t);
      expect(restored.time).toBeCloseTo(t, 6);
    }
  });

  it("分段恢复与一次性同步恢复结果相同", async () => {
    const { timeline } = buildStandard();
    const syncResult = simulateSync(timeline.script, {
      until: 47.3,
      initialBest: 0,
      duration: 60,
    });
    const chunked = await simulateChunked(timeline.script, {
      until: 47.3,
      initialBest: 0,
      duration: 60,
      chunkTicks: 7, // 故意切得很碎
    });
    expect(chunked).not.toBeNull();
    expect(chunked!.state).toEqual(syncResult.state);
    expect(chunked!.events).toEqual(syncResult.events);
  });

  it("从检查点续跑与从头模拟结果相同", () => {
    const { timeline } = buildStandard();
    const full = simulateSync(timeline.script, {
      until: 55,
      initialBest: 0,
      duration: 60,
    });
    // 每个检查点续跑到 55 都应等于从头模拟
    for (const cp of timeline.checkpoints) {
      if (cp.t > 55) continue;
      const part = simulateSync(timeline.script, {
        until: 55,
        from: cp,
        initialBest: 0,
        duration: 60,
      });
      expect(part.state, `从检查点 ${cp.t} 续跑不一致`).toEqual(full.state);
    }
  });
});
