import type { Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import type { ReplayEvent, ReplayEventType } from "./events";

/**
 * 状态观察器：比较一步操作前后的两份状态快照，推导出业务事件。
 * 游戏逻辑代码完全不需要改动，所有事件都能从状态差异中确定性地还原。
 *
 * 推导顺序固定（与游戏代码的执行顺序一致），因此同一时刻发生的
 * 多件事在每次重放中都会得到完全相同的 seq 序列。
 */
export function deriveEvents(
  before: Game,
  after: Game,
  step: "tick" | "command",
  allocSeq: () => number,
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const t = after.time;
  const emit = (
    type: ReplayEventType,
    text: string,
    data: Record<string, string | number>,
  ) => events.push({ t, seq: allocSeq(), type, text, data });

  const ordersBefore = new Map(before.orders.map((o) => [o.id, o]));
  const dishesBefore = new Map(before.dishes.map((d) => [d.id, d]));
  const entriesBefore = new Set(before.entries.map((e) => e.id));

  // —— 指令步骤：先推导指令本身的直接结果 ——
  if (step === "command") {
    // 接单：waiting → accepted
    for (const o of after.orders) {
      const prev = ordersBefore.get(o.id);
      if (prev && prev.status === "waiting" && o.status === "accepted") {
        emit("accept", `接下 ${o.guest} 的${recipes[o.recipe].name}`, {
          orderId: o.id,
          guest: o.guest,
          recipe: o.recipe,
        });
      }
    }
    // 采购：账本新增 supply 记录
    for (const e of after.entries) {
      if (!entriesBefore.has(e.id) && e.kind === "supply") {
        emit("restock", e.label, { entryId: e.id, amount: e.amount });
      }
    }
    // 备料：出现新的备料份
    const portionsBefore = new Set(before.portions.map((p) => p.id));
    for (const p of after.portions) {
      if (!portionsBefore.has(p.id)) {
        emit("prepare", `${recipes[p.recipe].name} 备料完成`, {
          portionId: p.id,
          recipe: p.recipe,
        });
      }
    }
    // 下锅：灶台由空变忙
    const stovesBefore = new Map(before.stoves.map((s) => [s.id, s]));
    for (const s of after.stoves) {
      const prev = stovesBefore.get(s.id);
      if (prev && !prev.portion && s.portion) {
        emit(
          "cook",
          `${recipes[s.portion.recipe].name} 下锅（${s.kind === "pan" ? "煎锅" : "汤锅"} ${s.id}）`,
          { stoveId: s.id, portionId: s.portion.id, recipe: s.portion.recipe },
        );
      }
    }
    // 起锅：出现新的菜品
    for (const d of after.dishes) {
      if (!dishesBefore.has(d.id)) {
        emit("lift", `${recipes[d.recipe].name} 起锅，品质 ${d.quality}`, {
          dishId: d.id,
          recipe: d.recipe,
          quality: d.quality,
        });
      }
    }
    // 装盘：counter → plated
    for (const d of after.dishes) {
      const prev = dishesBefore.get(d.id);
      if (prev && prev.stage === "counter" && d.stage === "plated") {
        emit("plate", `${recipes[d.recipe].name} 装盘`, {
          dishId: d.id,
          recipe: d.recipe,
        });
      }
    }
    // 上菜失败（错配 / 拒收）：订单耐心被扣但未成交
    for (const o of after.orders) {
      const prev = ordersBefore.get(o.id);
      if (prev && o.deadline < prev.deadline && o.status === prev.status) {
        const penalty = prev.deadline - o.deadline;
        emit(
          "serve-fail",
          penalty >= 10
            ? `给 ${o.guest} 上错了菜，耐心 -${penalty}s`
            : `${o.guest} 拒收低品质菜品，耐心 -${penalty}s`,
          { orderId: o.id, guest: o.guest, penalty },
        );
      }
    }
    // 上菜成功：账本新增 sale 记录
    for (const e of after.entries) {
      if (!entriesBefore.has(e.id) && e.kind === "sale") {
        const served = after.orders.find(
          (o) => o.status === "served" && ordersBefore.get(o.id)?.status !== "served",
        );
        emit("serve", `交付成功 +¥${e.amount}（${e.label}）`, {
          entryId: e.id,
          amount: e.amount,
          orderId: served?.id ?? 0,
        });
      }
    }
    // 丢弃：账本新增 waste 记录
    for (const e of after.entries) {
      if (!entriesBefore.has(e.id) && e.kind === "waste") {
        emit("discard", `丢弃菜品，浪费 ¥${-e.amount}`, {
          entryId: e.id,
          amount: e.amount,
        });
      }
    }
  }

  // —— 两种步骤都可能发生的时间类事件（指令 serve 内部也会触发超时）——
  // 离店：waiting/accepted → left
  for (const o of after.orders) {
    const prev = ordersBefore.get(o.id);
    if (prev && prev.status !== "left" && o.status === "left") {
      emit("leave", `${o.guest} 等待超时，离店`, {
        orderId: o.id,
        guest: o.guest,
      });
    }
  }
  // 到客：出现新订单
  for (const o of after.orders) {
    if (!ordersBefore.has(o.id)) {
      emit(
        "arrive",
        `${o.guest} 到店，点了${recipes[o.recipe].name}`,
        { orderId: o.id, guest: o.guest, recipe: o.recipe, deadline: o.deadline },
      );
    }
  }
  // 打烊
  if (!before.ended && after.ended) {
    emit("close", "午市结束，打烊结算", { served: after.served, missed: after.missed });
  }

  return events;
}
