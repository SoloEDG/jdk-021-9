<script setup lang="ts">
import type { Game } from "../../../shared/types";
import { totals, grade } from "../lib/totals";
defineProps<{ game: Game }>();
defineEmits<{ restart: [] }>();
</script>
<template>
  <div v-if="game.ended" class="overlay">
    <section class="result">
      <span class="eyebrow">SHIFT COMPLETE</span>
      <div class="grade">{{ grade(game) }}</div>
      <h2>午市打烊，主厨辛苦了</h2>
      <p>
        本场净收益 <b>¥{{ totals(game).net }}</b>
      </p>
      <p>完成 {{ game.served }} 单 · 离店 {{ game.missed }} 位</p>
      <button @click="$emit('restart')">再开一家好餐厅 ↗</button>
    </section>
  </div>
</template>
