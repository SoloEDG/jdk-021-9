import { describe, expect, it, vi } from "vitest";
import { buildTimeline, forkTimeline } from "../model/timeline";
import { restoreAt } from "../model/player";
import { exportReplay, importReplay } from "../model/persistence";
import { simulateSync } from "../model/simulator";
import { playShift, STANDARD_PLAY } from "./helpers";

describe("回放/演练不产生真实副作用", () => {
  it("全程不触碰本地存档（历史最佳不会被改掉）", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "123"),
      setItem,
      removeItem: vi.fn(),
    });
    try {
      // 真实对局（带历史最佳 123 开局）→ 生成回放 → 回放/分叉/导出/导入
      const played = playShift({ commands: STANDARD_PLAY, duration: 60, best: 123 });
      const timeline = buildTimeline({
        name: "原回放",
        initialBest: 123,
        duration: 60,
        script: played.recorder.script,
      });
      simulateSync(timeline.script, { initialBest: 123, duration: 60 });
      restoreAt(timeline, 30);
      const drill = forkTimeline(timeline, 22.5);
      drill.command({ type: "lift", id: 3 });
      drill.advanceToEnd();
      const forked = drill.finalize();
      const json = exportReplay([timeline, forked]);
      importReplay(json);
      // 以上所有回放侧操作都没有写过一次存档
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("演练中的采购只进演练账本，不影响真实对局", () => {
    const played = playShift({ commands: STANDARD_PLAY, duration: 60, best: 50 });
    const liveEntries = played.game.entries.length;
    const liveStock = { ...played.game.stock };
    const liveBest = played.game.best;

    const timeline = buildTimeline({
      name: "原回放",
      initialBest: 50,
      duration: 60,
      script: played.recorder.script,
    });
    const drill = forkTimeline(timeline, 10);
    drill.command({ type: "restock", ingredient: "beef" });
    drill.command({ type: "restock", ingredient: "beef" });
    drill.advanceToEnd();
    const forked = drill.finalize();

    // 演练账本里确实有两笔采购
    const drillSupplies = forked.final.entries.filter((e) => e.kind === "supply");
    expect(drillSupplies.length).toBeGreaterThanOrEqual(2);
    // 真实对局的账本、库存与历史最佳原封不动
    expect(played.game.entries.length).toBe(liveEntries);
    expect(played.game.stock).toEqual(liveStock);
    expect(played.game.best).toBe(liveBest);
  });
});
