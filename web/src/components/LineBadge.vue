<!--
  线路标识：仿东京地铁站号牌——线路色粗圆环 + 中间白底写线路字母。
  用法：<LineBadge :line="line" />  或  <LineBadge :line="line" :code="'I-13'" />（带站号）
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { Line } from '../adapters/types'
import { lineColor } from '../scene/layers/trains'

const props = defineProps<{ line: Pick<Line, 'id' | 'color' | 'lineCode'>; size?: number }>()
const color = computed(() => lineColor(props.line))
const s = computed(() => props.size ?? 26)
</script>

<template>
  <span class="badge num" :style="{ '--c': color, '--s': s + 'px' }" aria-hidden="true">{{ line.lineCode }}</span>
</template>

<style scoped>
.badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  border: calc(var(--s) * 0.16) solid var(--c);   /* 环宽随尺寸缩放 */
  background: #fff;
  font-weight: 700;
  font-size: calc(var(--s) * 0.42);
  line-height: 1;
  color: var(--ink);
}
</style>
