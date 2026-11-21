import type { Command, Game } from "../../../shared/types";
import { createGame } from "../../../shared/initial";
import { dispatch } from "../../../app/commands";
import { stepTick } from "../../../app/tick";
import { Recorder } from "../model/recorder";
import { cloneGame } from "../lib/clone";

export interface ScriptedCommand {
  at: number;
  cmd: Command;
}

export interface PlayedShift {
  game: Game;
  recorder: Recorder;
  snapshots: Map<number, Game>;
}

/**
 * 以与真实对局完全相同的路径（dispatch + stepTick + Recorder）
 * 打一场脚本化的午市，供各测试对比“实况”与“回放”。
 */
export function playShift(opts: {
  commands?: ScriptedCommand[];
  best?: number;
  duration?: number;
  snapshotEvery?: number;
}): PlayedShift {
  const g = createGame(opts.best ?? 0);
  g.running = true;
  if (opts.duration != null) g.duration = opts.duration;
  const recorder = new Recorder();
  const commands = [...(opts.commands ?? [])].sort((a, b) => a.at - b.at);
  const snapshots = new Map<number, Game>();
  const snapEvery = opts.snapshotEvery ? Math.round(opts.snapshotEvery * 10) : 0;
  const maybeSnap = () => {
    if (snapEvery && Math.round(g.time * 10) % snapEvery === 0) {
      snapshots.set(g.time, cloneGame(g));
    }
  };
  let ci = 0;
  const applyDue = () => {
    while (ci < commands.length && commands[ci].at <= g.time + 1e-9) {
      recorder.recordCommand(g, commands[ci].cmd, dispatch);
      ci++;
    }
  };
  applyDue();
  maybeSnap();
  while (!g.ended) {
    recorder.recordTick(g, stepTick);
    applyDue();
    maybeSnap();
  }
  return { game: g, recorder, snapshots };
}

/**
 * 标准脚本（午市 60s）：
 * 两单完美交付（牛排 48、意面 36+2 连击）、一次时蔬采购（-15）、
 * 小陈的沙拉单等到 55s 超时离店（-5）。
 * 净收益 = 48 + 38 - 15 - 5 = 66。
 */
export const STANDARD_PLAY: ScriptedCommand[] = [
  { at: 0.5, cmd: { type: "accept", id: 1 } },
  { at: 0.6, cmd: { type: "prepare", recipe: "steak" } }, // 份料 4
  { at: 1.0, cmd: { type: "cook", portion: 4, stove: 1 } },
  { at: 13.0, cmd: { type: "lift", id: 1 } }, // 菜品 4，品质 100
  { at: 13.2, cmd: { type: "plate", id: 4 } },
  { at: 13.5, cmd: { type: "serve" } }, // 订单 1：+48
  { at: 14.0, cmd: { type: "accept", id: 2 } },
  { at: 14.1, cmd: { type: "prepare", recipe: "pasta" } }, // 份料 6
  { at: 14.5, cmd: { type: "cook", portion: 6, stove: 3 } },
  { at: 24.5, cmd: { type: "lift", id: 3 } }, // 菜品 6，品质 100
  { at: 24.7, cmd: { type: "plate", id: 6 } },
  { at: 25.0, cmd: { type: "serve" } }, // 订单 2：+38
  { at: 30.0, cmd: { type: "restock", ingredient: "greens" } }, // -15
];
