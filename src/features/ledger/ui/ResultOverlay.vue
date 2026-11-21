<script setup lang="ts">
import type { Game } from "../../../shared/types";
import { totals, grade } from "../lib/totals";
defineProps<{ game: Game; dismissed?: boolean }>();
defineEmits<{ restart: []; dismiss: [] }>();
</script>
<template>
  <div v-if="game.ended && !dismissed" class="overlay">
    <section class="result">
      <span class="eyebrow">SHIFT COMPLETE</span>
      <div class="grade">{{ grade(game) }}</div>
      <h2>午市打烊，主厨辛苦了</h2>
      <p>
        本场净收益 <b>¥{{ totals(game).net }}</b>
      </p>
      <p>完成 {{ game.served }} 单 · 离店 {{ game.missed }} 位</p>
      <div class="result-actions">
        <button @click="$emit('restart')">再开一家好餐厅 ↗</button>
        <button class="outline" @click="$emit('dismiss')">查看营业回放</button>
      </div>
    </section>
  </div>
</template>
