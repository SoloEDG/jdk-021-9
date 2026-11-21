import type { Command } from "../../../shared/types";

/**
 * 回放事件：营业过程中一件可被观察的事。
 * 同一时刻（t 相同）可能发生多件事，seq 是单调递增的序号，
 * 排序键为 (t, seq)，保证同刻事件的顺序稳定。
 */
export type ReplayEventType =
  | "arrive" // 自动到客
  | "accept" // 接单
  | "prepare" // 备料
  | "restock" // 采购
  | "cook" // 下锅
  | "lift" // 起锅
  | "plate" // 装盘
  | "serve" // 上菜（交付成功）
  | "serve-fail" // 上错菜 / 拒收
  | "discard" // 丢弃
  | "leave" // 离店（等待超时）
  | "close"; // 打烊

export interface ReplayEvent {
  /** 营业时刻（秒，0.1 为最小刻度）。 */
  t: number;
  /** 全局单调序号；同一 t 下按 seq 排序，顺序稳定。 */
  seq: number;
  type: ReplayEventType;
  /** 展示用一句话描述。 */
  text: string;
  /** 结构化数据，供差异对比与界面展示。 */
  data: Record<string, string | number>;
}

/** 带来时刻与序号的指令，是回放/分叉重模拟的唯一输入。 */
export interface TimedCommand {
  t: number;
  seq: number;
  cmd: Command;
}

/** 事件排序：先时刻后序号，同刻顺序稳定。 */
export function compareEvents(a: ReplayEvent, b: ReplayEvent): number {
  return a.t - b.t || a.seq - b.seq;
}

/** 指令排序：先时刻后序号。 */
export function compareCommands(a: TimedCommand, b: TimedCommand): number {
  return a.t - b.t || a.seq - b.seq;
}

/** 把时间量化到 0.1s 刻度，避免浮点漂移。 */
export function quantize(t: number): number {
  return Math.round(t * 10) / 10;
}

export const EVENT_ICONS: Record<ReplayEventType, string> = {
  arrive: "🧑",
  accept: "📋",
  prepare: "🔪",
  restock: "🛒",
  cook: "🍳",
  lift: "♨",
  plate: "🍽",
  serve: "✅",
  "serve-fail": "⚠",
  discard: "🗑",
  leave: "🚪",
  close: "🌙",
};

export const COMMAND_LABELS: Record<Command["type"], string> = {
  accept: "接单",
  "select-order": "选中订单",
  prepare: "备料",
  cook: "下锅",
  lift: "起锅",
  plate: "装盘",
  "select-dish": "选中菜品",
  serve: "上菜",
  discard: "丢弃",
  restock: "采购",
};

/** 指令的一句话描述，用于差异报告。 */
export function describeCommand(c: TimedCommand): string {
  const label = COMMAND_LABELS[c.cmd.type];
  const detail = Object.entries(c.cmd)
    .filter(([k]) => k !== "type")
    .map(([, v]) => String(v))
    .join(" · ");
  return `「${label}${detail ? " " + detail : ""}」@${c.t.toFixed(1)}s`;
}
