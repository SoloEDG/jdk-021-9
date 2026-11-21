<script setup lang="ts">
import { ref } from "vue";
import { useSession } from "./session";
import { OrdersPanel } from "../features/orders";
import { PantryPanel } from "../features/pantry";
import { KitchenPanel } from "../features/kitchen";
import { ServicePanel } from "../features/service";
import { LedgerPanel, ResultOverlay, totals } from "../features/ledger";
import { ReplayPanel } from "../features/replay";
const { game, toggle, restart, runCommand, replayStore, player } = useSession();
const resultDismissed = ref(false);
function handleRestart() {
  resultDismissed.value = false;
  restart();
}
</script>
<template>
  <div class="app-shell">
    <aside class="rail">
      <a class="brand" href="#" aria-label="午市厨房">午<span>市</span></a>
      <div class="rail-line"></div>
      <span class="rail-icon active">♨</span
      ><span class="rail-label">厨房</span>
      <div class="rail-bottom">
        LUNCH<br />RUSH<br /><small>EST. 2026</small>
      </div>
    </aside>
    <main>
      <header>
        <div>
          <div class="eyebrow">LUNCH RUSH / A LITTLE KITCHEN, A BIG DREAM</div>
          <h1>午市厨房<span>一餐一味，分秒必争。</span></h1>
        </div>
        <div class="header-actions">
          <span class="open-dot"></span
          ><span>{{
            game.running ? "正在营业" : game.ended ? "今日打烊" : "准备开门"
          }}</span
          ><button class="outline" @click="handleRestart">重新开局</button>
        </div>
      </header>
      <div class="hero">
        <div>
          <span class="eyebrow">THE LUNCH SHIFT</span>
          <h2>把忙碌，做成美味。</h2>
          <p>备好食材，掌握火候，让每一位客人带着满足离开。</p>
          <button class="start-button" @click="toggle" :disabled="game.ended">
            {{
              game.running
                ? "Ⅱ 暂停营业"
                : game.time
                  ? "▶ 继续营业"
                  : "↗ 开始营业"
            }}
          </button>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="herb">✦</div>
          <div class="plate-art"><span>🥩</span><i>🥬</i><b>🍅</b></div>
          <span class="art-tag">FRESHLY MADE<br /><b>WITH LOVE</b></span>
        </div>
        <div class="hero-metrics">
          <div>
            <small>本场净收益</small><strong>¥{{ totals(game).net }}</strong>
          </div>
          <div>
            <small>距打烊还有</small
            ><strong
              >{{
                String(Math.floor((game.duration - game.time) / 60)).padStart(
                  2,
                  "0",
                )
              }}<em>:</em
              >{{
                String(Math.floor((game.duration - game.time) % 60)).padStart(
                  2,
                  "0",
                )
              }}</strong
            >
          </div>
          <span
            >连续交付 <b>{{ game.combo }}</b> 单</span
          >
        </div>
      </div>
      <OrdersPanel :game="game" @command="runCommand" />
      <div class="workspace">
        <PantryPanel
          :game="game"
          @command="runCommand"
        /><KitchenPanel
          :game="game"
          @command="runCommand"
        /><ServicePanel :game="game" @command="runCommand" />
      </div>
      <div class="notice" role="status">
        <span>✦ 主厨提示</span>{{ game.notice }}
      </div>
      <LedgerPanel :game="game" />
      <ReplayPanel :store="replayStore" :player="player" />
      <footer>
        好食材，好火候，好心情。<span
          >午市厨房 / LUNCH RUSH · 180 秒的小小餐厅</span
        >
      </footer>
    </main>
    <ResultOverlay
      :game="game"
      :dismissed="resultDismissed"
      @restart="handleRestart"
      @dismiss="resultDismissed = true"
    />
  </div>
</template>
