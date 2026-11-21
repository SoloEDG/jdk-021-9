<script setup lang="ts">
import type { Order, Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { patience } from "../lib/patience";
defineProps<{ order: Order; game: Game }>();
defineEmits<{ accept: [id: number]; select: [id: number] }>();
</script>
<template>
  <article
    class="ticket"
    :class="{
      selected: game.selectedOrder === order.id,
      urgent: patience(game, order) < 0.25,
    }"
  >
    <div class="ticket-top">
      <b>#{{ String(order.id).padStart(3, "0") }}</b
      ><span>{{ Math.ceil(order.deadline - game.time) }}s</span>
    </div>
    <div class="ticket-dish">
      <span>{{ recipes[order.recipe].icon }}</span
      ><strong>{{ recipes[order.recipe].name }}</strong>
    </div>
    <div class="muted">
      {{ order.guest }} · ¥{{ recipes[order.recipe].price }}
    </div>
    <div class="patience">
      <i :style="{ width: patience(game, order) * 100 + '%' }"></i>
    </div>
    <button
      v-if="order.status === 'waiting'"
      @click="$emit('accept', order.id)"
    >
      接单</button
    ><button v-else class="soft" @click="$emit('select', order.id)">
      {{ game.selectedOrder === order.id ? "已选为上菜目标" : "选择上菜目标" }}
    </button>
  </article>
</template>
