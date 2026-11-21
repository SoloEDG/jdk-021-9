<script setup lang="ts">
import type { Game, Command } from "../../../shared/types";
import { recipeList } from "../../../shared/catalog";
import IngredientShelf from "./IngredientShelf.vue";
import { preparationIssue } from "../lib/availability";
defineProps<{ game: Game }>();
defineEmits<{ command: [cmd: Command] }>();
</script>
<template>
  <section class="panel pantry-panel">
    <span class="eyebrow">02 / PREP STATION</span>
    <h2>食材准备 <span class="small">PREP</span></h2>
    <IngredientShelf
      :game="game"
      @restock="
        (ingredient) => $emit('command', { type: 'restock', ingredient })
      "
    />
    <div class="prep-actions">
      <button
        v-for="r in recipeList"
        :key="r.id"
        class="recipe-button"
        :disabled="!!preparationIssue(game, r.id)"
        @click="$emit('command', { type: 'prepare', recipe: r.id })"
      >
        <span>{{ r.icon }}</span
        ><b>{{ r.name }}</b
        ><small>备料 · 消耗1份</small>
      </button>
    </div>
    <p class="muted">
      已备 {{ game.portions.length }} / 6 份 · 在灶台选择空闲设备下锅
    </p>
  </section>
</template>
