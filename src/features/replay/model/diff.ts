import type { Entry } from "../../../shared/types";
import { describeCommand, type ReplayEvent, type TimedCommand } from "./events";
import type { Timeline } from "./timeline";

/** 逐笔收入差异的一行：同一笔业务收支在两条时间线里的对照。 */
export interface RevenueRow {
  /** 业务主键（订单 / 菜品 / 第 n 次采购），用于跨时间线对齐。 */
  ref: string;
  label: string;
  kind: Entry["kind"];
  /** 较早发生的时刻。 */
  at: number;
  original: number | null;
  forked: number | null;
  /** 演练 − 原时间线；某侧缺失时为 ±金额。 */
  delta: number;
}

export interface Divergence {
  /** 指令流中首个不一致的下标；完全一致为 null。 */
  commandIndex: number | null;
  /** 事件流中首个不一致的下标；完全一致为 null。 */
  eventIndex: number | null;
  /** 首个分歧原因的一句话说明。 */
  reason: string;
}

export interface TimelineDiff {
  rows: RevenueRow[];
  originalNet: number;
  forkedNet: number;
  netDelta: number;
  divergence: Divergence;
}

/** 账本条目的业务主键：优先用记录时写入的 ref，缺失时退化为 类型+说明+时刻。 */
function entryRef(e: Entry): string {
  return e.ref ?? `${e.kind}:${e.label}@${e.time.toFixed(1)}`;
}

const KIND_LABELS: Record<Entry["kind"], string> = {
  sale: "收入",
  supply: "采购",
  waste: "浪费",
  miss: "离店损失",
};

/**
 * 对比原时间线与分叉演练：
 * - 逐笔对齐账本，给出每笔收入/支出的差异；
 * - 找到指令流与事件流的首个分歧点，并给出可读的分歧原因。
 */
export function diffTimelines(original: Timeline, forked: Timeline): TimelineDiff {
  const rows = alignEntries(original.final.entries, forked.final.entries);
  const originalNet = original.final.entries.reduce((s, e) => s + e.amount, 0);
  const forkedNet = forked.final.entries.reduce((s, e) => s + e.amount, 0);
  return {
    rows,
    originalNet,
    forkedNet,
    netDelta: forkedNet - originalNet,
    divergence: findDivergence(original, forked),
  };
}

function alignEntries(a: Entry[], b: Entry[]): RevenueRow[] {
  const mapA = new Map(a.map((e) => [entryRef(e), e]));
  const mapB = new Map(b.map((e) => [entryRef(e), e]));
  const refs = [...new Set([...mapA.keys(), ...mapB.keys()])];
  const rows: RevenueRow[] = refs.map((ref) => {
    const ea = mapA.get(ref) ?? null;
    const eb = mapB.get(ref) ?? null;
    const src = ea ?? eb!;
    return {
      ref,
      label: src.label,
      kind: src.kind,
      at: Math.min(ea?.time ?? Infinity, eb?.time ?? Infinity),
      original: ea?.amount ?? null,
      forked: eb?.amount ?? null,
      delta: (eb?.amount ?? 0) - (ea?.amount ?? 0),
    };
  });
  rows.sort((x, y) => x.at - y.at || x.ref.localeCompare(y.ref));
  return rows;
}

function sameCommand(a: TimedCommand | undefined, b: TimedCommand | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.t === b.t &&
    a.cmd.type === b.cmd.type &&
    JSON.stringify(a.cmd) === JSON.stringify(b.cmd)
  );
}

function sameEvent(a: ReplayEvent | undefined, b: ReplayEvent | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.t === b.t &&
    a.type === b.type &&
    JSON.stringify(a.data) === JSON.stringify(b.data)
  );
}

const DATA_LABELS: Record<string, string> = {
  quality: "品质",
  amount: "金额",
  deadline: "耐心截止",
  orderId: "订单",
  dishId: "菜品",
  recipe: "菜谱",
  penalty: "耐心扣减",
};

function describeEventChanges(a: ReplayEvent, b: ReplayEvent): string {
  const keys = [...new Set([...Object.keys(a.data), ...Object.keys(b.data)])];
  const changes = keys
    .filter((k) => a.data[k] !== b.data[k])
    .map((k) => {
      const label = DATA_LABELS[k] ?? k;
      return `${label} ${a.data[k] ?? "—"} → ${b.data[k] ?? "—"}`;
    });
  return changes.join("，");
}

function findDivergence(original: Timeline, forked: Timeline): Divergence {
  const cs = original.script;
  const ds = forked.script;
  let commandIndex: number | null = null;
  const clen = Math.max(cs.length, ds.length);
  for (let i = 0; i < clen; i++) {
    if (!sameCommand(cs[i], ds[i])) {
      commandIndex = i;
      break;
    }
  }
  const es = original.events;
  const fs = forked.events;
  let eventIndex: number | null = null;
  const elen = Math.max(es.length, fs.length);
  for (let i = 0; i < elen; i++) {
    if (!sameEvent(es[i], fs[i])) {
      eventIndex = i;
      break;
    }
  }

  const parts: string[] = [];
  if (commandIndex !== null) {
    const before = cs[commandIndex];
    const after = ds[commandIndex];
    if (before && after) {
      const dt = after.t - before.t;
      const shift =
        before.cmd.type === after.cmd.type && dt !== 0
          ? `（${dt < 0 ? "提前" : "推迟"} ${Math.abs(dt).toFixed(1)}s）`
          : "";
      parts.push(
        `第 ${commandIndex + 1} 条指令起分歧：原 ${describeCommand(before)} → 演练 ${describeCommand(after)}${shift}`,
      );
    } else if (before) {
      parts.push(`演练放弃了原时间线第 ${commandIndex + 1} 条指令 ${describeCommand(before)}`);
    } else {
      parts.push(`演练新增了第 ${commandIndex + 1} 条指令 ${describeCommand(after)}`);
    }
  }
  if (eventIndex !== null) {
    const ea = es[eventIndex];
    const eb = fs[eventIndex];
    if (ea && eb) {
      const changes = describeEventChanges(ea, eb);
      parts.push(
        `首个受影响事件 #${eventIndex + 1}「${ea.text}」${changes ? `：${changes}` : ""}`,
      );
    } else if (ea) {
      parts.push(`首个受影响事件 #${eventIndex + 1}：演练中不再发生「${ea.text}」`);
    } else {
      parts.push(`首个受影响事件 #${eventIndex + 1}：演练中新增了「${eb.text}」`);
    }
  }
  return {
    commandIndex,
    eventIndex,
    reason: parts.length ? parts.join("；") : "两条时间线完全一致",
  };
}

export { KIND_LABELS };
