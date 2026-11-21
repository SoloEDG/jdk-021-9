<script setup lang="ts">
import type { Game, Command } from "../../../shared/types";
import StoveCard from "./StoveCard.vue";
defineProps<{ game: Game }>();
defineEmits<{ command: [cmd: Command] }>();
</script>
<template>
  <section class="panel kitchen-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">03 / THE HOT LINE</span>
        <h2>共享灶台 <span class="small">COOK</span></h2>
      </div>
      <span class="pill"
        >{{ game.stoves.filter((s) => s.portion).length }} / 3 使用中</span
      >
    </div>
    <div class="stoves">
      <StoveCard
        v-for="s in game.stoves"
        :key="s.id"
        :stove="s"
        :game="game"
        @command="(cmd) => $emit('command', cmd)"
      />
    </div>
    <div class="kitchen-note">
      <span>◷</span> 牛排 12s · 意面 10s · 沙拉 6s
      <span class="muted">提前或延迟起锅会降低品质</span>
    </div>
  </section>
</template>
