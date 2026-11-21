import { describe, expect, it } from "vitest";
import { createReplayStore, buildTimeline } from "../model/timeline";
import { ReplayPlayer, restoreAt } from "../model/player";
import { playShift, STANDARD_PLAY } from "./helpers";

function makeStore() {
  const store = createReplayStore();
  const a = playShift({ commands: STANDARD_PLAY, duration: 60 });
  const tlA = buildTimeline({
    id: "A",
    name: "回放A",
    initialBest: 0,
    duration: 60,
    script: a.recorder.script,
  });
  // 一条内容不同的回放 B（空脚本，只有自动事件）
  const b = playShift({ commands: [], duration: 60 });
  const tlB = buildTimeline({
    id: "B",
    name: "回放B",
    initialBest: 0,
    duration: 60,
    script: b.recorder.script,
  });
  store.add(tlA);
  store.add(tlB);
  return { store, tlA, tlB };
}

describe("ReplayPlayer 分段恢复与纪元保护", () => {
  it("拖动到任意时刻，分段恢复出当时场面", async () => {
    const { store, tlA } = makeStore();
    const player = new ReplayPlayer(store, { chunkTicks: 20 });
    await player.open("A");
    expect(player.view.time).toBe(0);
    await player.seek(37.5);
    expect(player.view.restoring).toBe(false);
    expect(player.view.state).toEqual(restoreAt(tlA, 37.5));
    // 事件列表只包含该时刻之前的事件
    const last = player.view.events[player.view.events.length - 1];
    expect(last.t).toBeLessThanOrEqual(37.5);
    expect(player.view.events.length).toBeGreaterThan(0);
  });

  it("切到另一条回放后，迟到的恢复结果不会覆盖新选择", async () => {
    const { store, tlB } = makeStore();
    const player = new ReplayPlayer(store, { chunkTicks: 1 }); // 每拍都让出，制造迟到窗口
    await player.open("A");
    const slow = player.seek(55); // 长距离恢复，需要多次让出
    const switched = player.open("B"); // 立即切到回放 B
    await Promise.all([slow, switched]);
    expect(player.view.timelineId).toBe("B");
    expect(player.view.time).toBe(0);
    expect(player.view.state).toEqual(restoreAt(tlB, 0));
    expect(player.view.restoring).toBe(false);
  });

  it("连续拖动时，只有最后一次拖动生效", async () => {
    const { store, tlA } = makeStore();
    const player = new ReplayPlayer(store, { chunkTicks: 5 });
    await player.open("A");
    const s1 = player.seek(55);
    const s2 = player.seek(25);
    const s3 = player.seek(40);
    await Promise.all([s1, s2, s3]);
    expect(player.view.time).toBe(40);
    expect(player.view.state).toEqual(restoreAt(tlA, 40));
  });

  it("恢复期间报告进度，结束后归位", async () => {
    const { store } = makeStore();
    const player = new ReplayPlayer(store, { chunkTicks: 30 });
    await player.open("A");
    const seen: number[] = [];
    const orig = player.view;
    const p = player.seek(50);
    seen.push(orig.progress);
    await p;
    expect(player.view.progress).toBe(1);
    expect(player.view.restoring).toBe(false);
  });
});
