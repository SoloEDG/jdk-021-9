<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { Command, Ingredient } from "../../../shared/types";
import { recipes, ingredients } from "../../../shared/catalog";
import { totals } from "../../ledger";
import { OrdersPanel } from "../../orders";
import { PantryPanel } from "../../pantry";
import { KitchenPanel } from "../../kitchen";
import { ServicePanel } from "../../service";
import { diffTimelines } from "../model/diff";
import { exportReplay, importReplay } from "../model/persistence";
import { EVENT_ICONS, quantize } from "../model/events";
import { forkTimeline, type DrillSession } from "../model/timeline";
import type { ReplayStore, Timeline } from "../model/timeline";
import type { ReplayPlayer } from "../model/player";

const props = defineProps<{ store: ReplayStore; player: ReplayPlayer }>();

const mode = ref<"replay" | "drill">("replay");
const drill = ref<DrillSession | null>(null);
const message = ref("");
let importCounter = 0;

const current = computed<Timeline | undefined>(() =>
  props.store.byId(props.player.view.timelineId ?? ""),
);
const diff = computed(() => {
  const tl = current.value;
  if (!tl?.parentId) return null;
  const parent = props.store.byId(tl.parentId);
  return parent ? diffTimelines(parent, tl) : null;
});

// 打烊生成首条回放后自动打开
watch(
  () => props.store.timelines.length,
  (n) => {
    if (n > 0 && !props.player.view.timelineId) {
      void props.player.open(props.store.timelines[0].id);
    }
  },
  { immediate: true },
);

function select(id: string) {
  stopPlay();
  mode.value = "replay";
  drill.value = null;
  void props.player.open(id);
}

function onScrub(e: Event) {
  void props.player.seek(Number((e.target as HTMLInputElement).value));
}

function jumpTo(t: number) {
  void props.player.seek(t);
}

// —— 自动播放 ——
const playing = ref(false);
let playTimer: number | null = null;
function stopPlay() {
  if (playTimer != null) clearInterval(playTimer);
  playTimer = null;
  playing.value = false;
}
function togglePlay() {
  if (playing.value) {
    stopPlay();
    return;
  }
  playing.value = true;
  playTimer = window.setInterval(() => {
    const tl = current.value;
    if (!tl || props.player.view.restoring) return;
    const next = quantize(props.player.view.time + 0.5);
    if (next >= tl.duration) {
      void props.player.seek(tl.duration);
      stopPlay();
    } else {
      void props.player.seek(next);
    }
  }, 150);
}
onUnmounted(stopPlay);

// —— 分叉演练 ——
function startFork() {
  const tl = current.value;
  if (!tl || !props.player.view.state) return;
  stopPlay();
  drill.value = forkTimeline(tl, props.player.view.time);
  mode.value = "drill";
}
function drillCommand(c: Command) {
  drill.value?.command(c);
}
function drillAdvance(sec: number) {
  drill.value?.advanceTo(drill.value.time + sec);
}
function drillToEnd() {
  drill.value?.advanceToEnd();
}
function finishDrill() {
  if (!drill.value) return;
  const tl = drill.value.finalize();
  props.store.add(tl);
  drill.value = null;
  mode.value = "replay";
  void props.player.open(tl.id);
  message.value = `演练已保存为「${tl.name}」，正在与原回放对比`;
}
function discardDrill() {
  drill.value = null;
  mode.value = "replay";
}

// —— 导出 / 导入 ——
function doExport() {
  const blob = new Blob([exportReplay(props.store.timelines)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lunch-rush-replay-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  message.value = `已导出 ${props.store.timelines.length} 条回放记录`;
}
function doImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    try {
      const result = importReplay(text);
      for (const t of result.timelines) {
        if (props.store.byId(t.id)) t.id = `${t.id}_imp${++importCounter}`;
        props.store.add(t);
      }
      const rej = result.rejected
        .map((r) => `「${r.name}」${r.reasons.join("；")}`)
        .join("。");
      message.value =
        `成功导入 ${result.timelines.length} 条回放` +
        (result.rejected.length
          ? `；识别出 ${result.rejected.length} 条不兼容记录：${rej}`
          : "");
      if (result.timelines.length && !props.player.view.timelineId) {
        select(props.store.timelines[0].id);
      }
    } catch (err) {
      message.value = (err as Error).message;
    }
    input.value = "";
  });
}

// —— 展示辅助 ——
const ingredientKeys: Ingredient[] = ["beef", "noodle", "greens"];
const ORDER_STATUS: Record<string, string> = {
  waiting: "待接单",
  accepted: "制作中",
  served: "已交付",
  left: "已离店",
};
function fmtAmount(v: number | null): string {
  return v === null ? "—" : `¥${v}`;
}
function fmtDelta(v: number): string {
  return v === 0 ? "0" : v > 0 ? `+¥${v}` : `−¥${-v}`;
}
</script>

<template>
  <section v-if="store.timelines.length" class="panel replay-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">06 / REPLAY &amp; DRILL</span>
        <h2>营业回放 <span class="small">REPLAY</span></h2>
      </div>
      <div class="replay-actions">
        <button class="tiny soft" @click="doExport">导出回放</button>
        <label class="tiny soft import-label"
          >导入回放<input type="file" accept="application/json" hidden @change="doImport"
        /></label>
      </div>
    </div>

    <div class="replay-tabs">
      <button
        v-for="t in store.timelines"
        :key="t.id"
        :class="{ active: t.id === player.view.timelineId }"
        @click="select(t.id)"
      >
        {{ t.parentId ? "🌿" : "📼" }} {{ t.name
        }}<template v-if="t.forkAt != null">（@{{ t.forkAt.toFixed(1) }}s）</template>
      </button>
    </div>

    <p v-if="message" class="replay-message">{{ message }}</p>

    <!-- ————— 回放模式 ————— -->
    <div v-if="mode === 'replay' && current" class="replay-body">
      <div class="scrub-row">
        <span class="time-chip">{{ player.view.time.toFixed(1) }}s</span>
        <input
          type="range"
          :min="0"
          :max="current.duration"
          :step="0.1"
          :value="player.view.time"
          :aria-label="'拖动查看任意时刻'"
          @input="onScrub"
        />
        <span class="muted">/ {{ current.duration }}s</span>
        <button class="tiny soft" @click="togglePlay">
          {{ playing ? "Ⅱ 暂停" : "▶ 播放" }}
        </button>
        <span v-if="player.view.restoring" class="restoring">
          分段恢复中 {{ Math.round(player.view.progress * 100) }}%
        </span>
      </div>

      <div v-if="player.view.state" class="state-cards">
        <div class="state-card">
          <h3>库存</h3>
          <div v-for="k in ingredientKeys" :key="k" class="state-row">
            <span>{{ ingredients[k].icon }} {{ ingredients[k].name }}</span>
            <b>×{{ player.view.state.stock[k] }}</b>
          </div>
        </div>
        <div class="state-card">
          <h3>设备</h3>
          <div v-for="s in player.view.state.stoves" :key="s.id" class="state-row">
            <span>{{ s.kind === "pan" ? "煎锅" : "汤锅" }} {{ s.id }}</span>
            <b v-if="s.portion">
              {{ recipes[s.portion.recipe].icon }}
              已烹 {{ (player.view.time - s.started).toFixed(1) }}s
            </b>
            <b v-else class="muted">空闲</b>
          </div>
        </div>
        <div class="state-card">
          <h3>订单</h3>
          <div v-for="o in player.view.state.orders" :key="o.id" class="state-row">
            <span>{{ o.guest }} · {{ recipes[o.recipe].icon }}</span>
            <b>{{ ORDER_STATUS[o.status] }}</b>
          </div>
          <div v-if="!player.view.state.orders.length" class="muted">暂无订单</div>
        </div>
        <div class="state-card">
          <h3>账本</h3>
          <div class="state-row">
            <span>净收益</span><b>¥{{ totals(player.view.state).net }}</b>
          </div>
          <div
            v-for="e in player.view.state.entries.slice(-4).reverse()"
            :key="e.id"
            class="state-row"
          >
            <span>{{ e.label }}</span>
            <b>{{ e.amount >= 0 ? "+" : "" }}{{ e.amount }}</b>
          </div>
          <div v-if="!player.view.state.entries.length" class="muted">还没有流水</div>
        </div>
      </div>

      <div class="event-list" v-if="current.events.length">
        <div
          v-for="e in current.events"
          :key="e.seq"
          class="event-row"
          :class="{ future: e.t > player.view.time + 0.001 }"
          @click="jumpTo(e.t)"
        >
          <span class="e-time">{{ e.t.toFixed(1) }}</span>
          <span class="e-icon">{{ EVENT_ICONS[e.type] }}</span>
          <span>{{ e.text }}</span>
        </div>
      </div>

      <div class="fork-row">
        <button :disabled="player.view.restoring || !player.view.state" @click="startFork">
          🌿 在 {{ player.view.time.toFixed(1) }}s 分叉演练
        </button>
        <span class="muted"
          >复制当前局面开一条演练线，只沿新决定推进；原回放与历史最佳不受影响</span
        >
      </div>

      <div v-if="diff" class="diff-box">
        <h3>与原回放的差异</h3>
        <p class="divergence">⚑ 首个分歧：{{ diff.divergence.reason }}</p>
        <table>
          <thead>
            <tr>
              <th>账目（逐笔）</th>
              <th>原回放</th>
              <th>演练</th>
              <th>差异</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in diff.rows" :key="r.ref">
              <td>{{ r.label }}</td>
              <td>{{ fmtAmount(r.original) }}</td>
              <td>{{ fmtAmount(r.forked) }}</td>
              <td :class="{ pos: r.delta > 0, neg: r.delta < 0 }">
                {{ fmtDelta(r.delta) }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>净收益合计</td>
              <td>{{ fmtAmount(diff.originalNet) }}</td>
              <td>{{ fmtAmount(diff.forkedNet) }}</td>
              <td :class="{ pos: diff.netDelta > 0, neg: diff.netDelta < 0 }">
                {{ fmtDelta(diff.netDelta) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ————— 演练模式 ————— -->
    <div v-else-if="mode === 'drill' && drill" class="drill-body">
      <div class="drill-banner">
        <b>🌿 演练中</b>
        <span>从 {{ drill.forkAt.toFixed(1) }}s 分叉 · 当前 {{ drill.time.toFixed(1) }}s</span>
        <span class="muted">只沿新决定推进 · 原回放与历史最佳不会被改动</span>
      </div>
      <div class="drill-controls">
        <button class="tiny soft" @click="drillAdvance(1)">推进 +1s</button>
        <button class="tiny soft" @click="drillAdvance(5)">+5s</button>
        <button class="tiny soft" @click="drillAdvance(10)">+10s</button>
        <button class="tiny soft" @click="drillToEnd">推进到打烊</button>
        <button class="tiny" @click="finishDrill">完成演练并对比</button>
        <button class="tiny soft" @click="discardDrill">放弃演练</button>
      </div>
      <div class="notice drill-notice"><span>✦ 演练提示</span>{{ drill.state.notice }}</div>
      <OrdersPanel :game="drill.state" @command="drillCommand" />
      <div class="workspace">
        <PantryPanel :game="drill.state" @command="drillCommand" />
        <KitchenPanel :game="drill.state" @command="drillCommand" />
        <ServicePanel :game="drill.state" @command="drillCommand" />
      </div>
    </div>
  </section>
</template>
