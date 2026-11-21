<script setup lang="ts">
import type { Game, Stove, Command } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { heatLabel } from "../lib/heat";
defineProps<{ game: Game; stove: Stove }>();
defineEmits<{ command: [cmd: Command] }>();
</script>
<template>
  <article class="stove" :class="{ cooking: stove.portion }">
    <div class="stove-head">
      <b>{{ stove.kind === "pan" ? "煎锅" : "汤锅" }} 0{{ stove.id }}</b
      ><span class="status-dot">{{ heatLabel(game, stove) }}</span>
    </div>
    <div class="burner">
      <div class="pan-shape">
        <span>{{
          stove.portion ? recipes[stove.portion.recipe].icon : "＋"
        }}</span>
      </div>
      <div v-if="stove.portion" class="flame">♨ ♨ ♨</div>
    </div>
    <template v-if="stove.portion"
      ><strong>{{ recipes[stove.portion.recipe].name }}</strong>
      <p class="timer">
        {{ (game.time - stove.started).toFixed(1)
        }}<small> / {{ recipes[stove.portion.recipe].target }} 秒</small>
      </p>
      <div class="heat-track">
        <i
          :style="{
            width:
              Math.min(
                100,
                ((game.time - stove.started) /
                  (recipes[stove.portion.recipe].target * 1.8)) *
                  100,
              ) + '%',
          }"
        ></i
        ><span></span>
      </div>
      <button
        class="warm"
        @click="$emit('command', { type: 'lift', id: stove.id })"
      >
        起锅
      </button></template
    ><template v-else
      ><p class="muted">等待食材下锅</p>
      <div class="portion-picker">
        <button
          v-for="p in game.portions.filter(
            (p) => recipes[p.recipe].station === stove.kind,
          )"
          :key="p.id"
          class="tiny soft"
          @click="
            $emit('command', { type: 'cook', portion: p.id, stove: stove.id })
          "
        >
          {{ recipes[p.recipe].icon }} #{{ p.id }} 下锅</button
        ><small
          v-if="
            !game.portions.some((p) => recipes[p.recipe].station === stove.kind)
          "
          >先到备料台准备食材</small
        >
      </div></template
    >
  </article>
</template>
