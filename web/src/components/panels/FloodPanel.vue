<!--
  防灾模式面板：选择浸水想定场景、调节浸水深阈值，实时统计受影响建筑数。
  三维中同时显示：浸水区域面（按深度抬升）+ 建筑按浸水深着色。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useTwin } from '../../stores/twin'
import { countAtLeast } from '../../adapters/stats'
import { FLOOD_LEGEND } from '../../scene/layers/buildings'

const twin = useTwin()
const scenarios = computed(() => Object.entries(twin.stats?.scenarios ?? {}))
const sc = computed(() => twin.stats?.scenarios[twin.floodScenario])

const affected = computed(() => (sc.value ? countAtLeast(sc.value.depths, Math.max(twin.floodThreshold, 0.0001)) : 0))
const share = computed(() => (twin.stats ? affected.value / twin.stats.total : 0))

// 分档统计，和图例同一套分档
const bands = computed(() => {
  if (!sc.value) return []
  const d = sc.value.depths
  const edges = [0.0001, 0.5, 3, 5, Infinity]
  const labels = ['0.5 m 以下', '0.5–3 m', '3–5 m', '5 m 以上']
  const colors = [...FLOOD_LEGEND.map(f => f[1])].reverse()
  return labels.map((label, i) => ({ label, color: colors[i], n: countAtLeast(d, edges[i]) - countAtLeast(d, edges[i + 1]) }))
})
const maxBand = computed(() => Math.max(1, ...bands.value.map(b => b.n)))

/** 0.5 米≈膝盖，1 米≈一层地面浸水，3 米≈二层浸水：给阈值一个直观解释 */
const thresholdHint = computed(() => {
  const t = twin.floodThreshold
  if (t < 0.5) return '地面积水，步行困难'
  if (t < 1) return '约及膝，车辆无法通行'
  if (t < 3) return '一层地面浸水'
  return '二层以上浸水'
})
</script>

<template>
  <div class="panel">
    <section>
      <h2>浸水想定场景</h2>
      <select class="full" v-model="twin.floodScenario" aria-label="浸水想定场景">
        <option v-for="[k, v] in scenarios" :key="k" :value="k">{{ v.title }}</option>
      </select>
      <small class="hint" style="margin-top:6px">PLATEAU 洪水 / 高潮浸水想定区域模型，水面已按想定浸水深抬升。L1 为计划规模降雨，L2 为想定最大规模降雨。</small>
    </section>

    <section v-if="sc">
      <h2>浸水深阈值</h2>
      <div class="replay">
        <div class="rl"><span>{{ thresholdHint }}</span><b class="num">≥ {{ twin.floodThreshold.toFixed(1) }} m</b></div>
        <input type="range" min="0" :max="Math.ceil(sc.maxDepth * 2) / 2" step="0.1" v-model.number="twin.floodThreshold" aria-label="浸水深阈值" />
      </div>
      <div class="big-stat">
        <span class="num">{{ affected.toLocaleString() }}</span>
        <span>栋建筑浸水 ≥ {{ twin.floodThreshold.toFixed(1) }} m，占全区 {{ (share * 100).toFixed(1) }}%</span>
      </div>
      <p>该场景共 {{ sc.affected.toLocaleString() }} 栋建筑位于浸水范围内，最大浸水深 {{ sc.maxDepth }} m。</p>
      <div class="bands">
        <div v-for="b in bands" :key="b.label" class="band">
          <span class="lb">{{ b.label }}</span>
          <span class="bar"><i :style="{ width: (b.n / maxBand * 100) + '%', background: b.color }" /></span>
          <span class="num n">{{ b.n.toLocaleString() }}</span>
        </div>
      </div>
      <small class="hint" style="margin-top:8px">建筑颜色 = 该建筑的想定浸水深；低于阈值的建筑显示为灰色。</small>
    </section>
  </div>
</template>

<style scoped src="./panel.css"></style>
<style scoped>
.bands { margin-top: 8px; display: grid; gap: 5px; }
.band { display: grid; grid-template-columns: 74px 1fr 48px; gap: 8px; align-items: center; font-size: 12px; color: var(--ink-2); }
.bar { height: 10px; background: var(--mist); border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; }
.n { text-align: right; font-size: 14px; font-weight: 600; color: var(--ink); }
</style>
