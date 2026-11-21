<script setup lang="ts">
import type { Game, Ingredient } from "../../../shared/types";
import { ingredients } from "../../../shared/catalog";
defineProps<{ game: Game }>();
defineEmits<{ restock: [i: Ingredient] }>();
const ids: Ingredient[] = ["beef", "noodle", "greens"];
</script>
<template>
  <div class="shelf">
    <div v-for="i in ids" :key="i" class="stock-row">
      <span>{{ ingredients[i].icon }} {{ ingredients[i].name }}</span
      ><b :class="{ red: game.stock[i] === 0 }">{{ game.stock[i] }} 份</b
      ><button
        class="tiny soft"
        @click="$emit('restock', i)"
        :aria-label="'采购' + ingredients[i].name"
      >
        +3 / ¥{{ ingredients[i].cost * 3 }}
      </button>
    </div>
  </div>
</template>
