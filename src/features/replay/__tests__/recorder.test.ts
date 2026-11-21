import { describe, expect, it } from "vitest";
import { createGame } from "../../../shared/initial";
import { dispatch } from "../../../app/commands";
import { stepTick } from "../../../app/tick";
import { Recorder } from "../model/recorder";
import { playShift, STANDARD_PLAY } from "./helpers";

describe("Recorder 事件记录", () => {
  it("记录全部业务事件：接单/备料/下锅/起锅/装盘/上菜/到客/离店/采购/打烊", () => {
    const { recorder } = playShift({ commands: STANDARD_PLAY, duration: 60 });
    const types = new Set(recorder.events.map((e) => e.type));
    for (const t of [
      "accept",
      "prepare",
      "cook",
      "lift",
      "plate",
      "serve",
      "arrive",
      "leave",
      "restock",
      "close",
    ]) {
      expect(types.has(t as never), `缺少事件类型 ${t}`).toBe(true);
    }
    // 自动到客发生在 18/36/54 秒
    const arrives = recorder.events.filter((e) => e.type === "arrive");
    expect(arrives.map((e) => e.t)).toEqual([18, 36, 54]);
    // 小陈的订单 55s 超时离店
    const leave = recorder.events.find((e) => e.type === "leave");
    expect(leave?.t).toBe(55);
    expect(leave?.data.guest).toBe("小陈");
  });

  it("同一时刻发生多件事时按 seq 保持稳定顺序", () => {
    const g = createGame(0);
    g.running = true;
    const rec = new Recorder();
    rec.recordTick(g, stepTick); // t = 0.1
    rec.recordCommand(g, { type: "accept", id: 1 }, dispatch);
    rec.recordCommand(g, { type: "prepare", recipe: "steak" }, dispatch);
    rec.recordCommand(g, { type: "accept", id: 2 }, dispatch);
    expect(rec.events.map((e) => e.type)).toEqual(["accept", "prepare", "accept"]);
    expect(rec.events.every((e) => e.t === 0.1)).toBe(true);
    const seqs = rec.events.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("同一节拍里多件事的顺序也稳定（两单同时超时）", () => {
    const g = createGame(0);
    g.running = true;
    g.orders[0].deadline = 10;
    g.orders[1].deadline = 10;
    const rec = new Recorder();
    while (g.time < 11 && !g.ended) rec.recordTick(g, stepTick);
    const leaves = rec.events.filter((e) => e.type === "leave");
    expect(leaves).toHaveLength(2);
    expect(leaves[0].t).toBe(10);
    expect(leaves[1].t).toBe(10);
    expect(leaves[0].data.orderId).toBe(1);
    expect(leaves[1].data.orderId).toBe(2);
    expect(leaves[0].seq).toBeLessThan(leaves[1].seq);
  });

  it("被拒绝的指令不进入回放脚本", () => {
    const g = createGame(0); // running = false，暂停状态
    const rec = new Recorder();
    expect(rec.recordCommand(g, { type: "accept", id: 1 }, dispatch)).toBe(false);
    g.running = true;
    g.stock.beef = 0; // 缺货，备料会被拒绝
    expect(rec.recordCommand(g, { type: "prepare", recipe: "steak" }, dispatch)).toBe(false);
    expect(rec.script).toHaveLength(0);
    expect(rec.events).toHaveLength(0);
  });

  it("上错菜与低品质拒收也会留下事件", () => {
    const g = createGame(0);
    g.running = true;
    const rec = new Recorder();
    // 接下牛排单，却装盘一份沙拉送过去
    rec.recordCommand(g, { type: "accept", id: 1 }, dispatch);
    rec.recordCommand(g, { type: "prepare", recipe: "salad" }, dispatch);
    rec.recordCommand(g, { type: "cook", portion: 4, stove: 1 }, dispatch);
    for (let i = 0; i < 60; i++) rec.recordTick(g, stepTick); // 6s，沙拉正好
    rec.recordCommand(g, { type: "lift", id: 1 }, dispatch);
    rec.recordCommand(g, { type: "plate", id: 4 }, dispatch);
    rec.recordCommand(g, { type: "serve" }, dispatch); // 错配！
    const fail = rec.events.find((e) => e.type === "serve-fail");
    expect(fail).toBeDefined();
    expect(fail?.text).toContain("上错");
  });
});
