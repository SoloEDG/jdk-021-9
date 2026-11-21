import { describe, expect, it } from "vitest";
import { buildTimeline, forkTimeline } from "../model/timeline";
import { restoreAt } from "../model/player";
import { diffTimelines } from "../model/diff";
import { playShift, STANDARD_PLAY } from "./helpers";

function buildOriginal() {
  const played = playShift({ commands: STANDARD_PLAY, duration: 60 });
  return buildTimeline({
    id: "orig",
    name: "原始回放",
    initialBest: 0,
    duration: 60,
    script: played.recorder.script,
  });
}

describe("分叉演练", () => {
  it("分叉点的演练局面与原回放该时刻一致", () => {
    const original = buildOriginal();
    const drill = forkTimeline(original, 22.5);
    expect(drill.state).toEqual(restoreAt(original, 22.5));
    expect(drill.time).toBe(22.5);
  });

  it("提前两秒起锅：只沿新决定推进，原回放完整保留", () => {
    const original = buildOriginal();
    const eventsBefore = original.events.length;
    const scriptBefore = original.script.length;
    const hashBefore = original.finalHash;

    // 原时间线：24.5s 起锅（品质 100）；演练：22.5s 起锅（品质 76）
    const drill = forkTimeline(original, 22.5);
    drill.command({ type: "lift", id: 3 });
    drill.advanceTo(24.7);
    drill.command({ type: "plate", id: 6 });
    drill.advanceTo(25.0);
    drill.command({ type: "serve" });
    drill.advanceTo(30.0);
    drill.command({ type: "restock", ingredient: "greens" });
    drill.advanceToEnd();
    const forked = drill.finalize();

    // 原回放未被改动
    expect(original.events.length).toBe(eventsBefore);
    expect(original.script.length).toBe(scriptBefore);
    expect(original.finalHash).toBe(hashBefore);

    // 演练线确实沿着新决定推进
    const lift = forked.events.find((e) => e.type === "lift" && e.data.dishId === 6);
    expect(lift?.t).toBe(22.5);
    expect(lift?.data.quality).toBe(76);

    // 不能混用原时间线里已经失效的交付：
    // 订单 2 在演练中只被交付一次，且金额是按新品质算的 29，而非原来的 38
    const sales = forked.final.entries.filter((e) => e.ref === "order:2");
    expect(sales).toHaveLength(1);
    expect(sales[0].amount).toBe(29);
    expect(
      forked.events.filter((e) => e.type === "serve" && e.data.orderId === 2),
    ).toHaveLength(1);
    // 原时间线那次 +38 的交付事件没有混进来
    expect(
      forked.events.some((e) => e.type === "serve" && e.data.amount === 38),
    ).toBe(false);
  });

  it("逐笔收入差异与首个分歧原因", () => {
    const original = buildOriginal();
    const drill = forkTimeline(original, 22.5);
    drill.command({ type: "lift", id: 3 });
    drill.advanceTo(24.7);
    drill.command({ type: "plate", id: 6 });
    drill.advanceTo(25.0);
    drill.command({ type: "serve" });
    drill.advanceTo(30.0);
    drill.command({ type: "restock", ingredient: "greens" });
    drill.advanceToEnd();
    const forked = drill.finalize();

    const diff = diffTimelines(original, forked);
    // 只有订单 2 的收入不同
    const changed = diff.rows.filter((r) => r.delta !== 0);
    expect(changed).toHaveLength(1);
    expect(changed[0].ref).toBe("order:2");
    expect(changed[0].original).toBe(38);
    expect(changed[0].forked).toBe(29);
    expect(changed[0].delta).toBe(-9);
    expect(diff.originalNet).toBe(66);
    expect(diff.forkedNet).toBe(57);
    expect(diff.netDelta).toBe(-9);

    // 首个分歧：第 10 条指令「起锅」提前 2 秒
    expect(diff.divergence.commandIndex).toBe(9);
    expect(diff.divergence.reason).toContain("起锅");
    expect(diff.divergence.reason).toContain("提前 2.0s");
    // 首个受影响的事件是那次起锅（品质 100 → 76）
    expect(diff.divergence.eventIndex).not.toBeNull();
    const ev = forked.events[diff.divergence.eventIndex!];
    expect(ev.type).toBe("lift");
    expect(diff.divergence.reason).toContain("100 → 76");
  });

  it("演练放弃的决定会在逐笔差异中体现为单边行", () => {
    const original = buildOriginal();
    // 分叉后什么都不做，直接推进到打烊（不采购、不应答后续订单）
    const drill = forkTimeline(original, 28);
    drill.advanceToEnd();
    const forked = drill.finalize();

    const diff = diffTimelines(original, forked);
    const supply = diff.rows.find((r) => r.ref === "supply:greens:1");
    expect(supply?.original).toBe(-15);
    expect(supply?.forked).toBeNull();
    expect(supply?.delta).toBe(15);
    // 原回放 30s 的采购指令在演练中不存在 → 指令流有分歧
    expect(diff.divergence.commandIndex).not.toBeNull();
  });

  it("完全一致的时间线没有分歧", () => {
    const original = buildOriginal();
    const diff = diffTimelines(original, original);
    expect(diff.divergence.commandIndex).toBeNull();
    expect(diff.divergence.eventIndex).toBeNull();
    expect(diff.divergence.reason).toBe("两条时间线完全一致");
    expect(diff.rows.every((r) => r.delta === 0)).toBe(true);
  });
});
