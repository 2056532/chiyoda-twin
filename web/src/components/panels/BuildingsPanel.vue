<!--
  建筑模式面板：着色方案切换、底图切换、建筑统计（高度分布、用途构成、最高建筑）。
  统计来自 tools/build_stats.py 对全量 1.2 万栋建筑属性的预处理。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useTwin } from '../../stores/twin'
import { HEIGHT_LEGEND, USAGE_LEGEND, type BuildingMode } from '../../scene/layers/buildings'
import BarChart from '../BarChart.vue'

const twin = useTwin()
const modes: { id: BuildingMode; label: string }[] = [
  { id: 'texture', label: '真实纹理' },
  { id: 'height', label: '按高度' },
  { id: 'usage', label: '按用途' },
]
const s = computed(() => twin.stats)

// 高度直方图从高到低显示，颜色与三维着色一致
const heightItems = computed<[string, number][]>(() => (s.value?.heightHist ?? []).map(h => [h.label, h.count] as [string, number]).reverse())
// 直方图有 7 档（多一个 0–10m），图例 6 档：按每档的下限高度去图例里找颜色，保证和三维着色一致
const heightColors = computed(() => heightItems.value.map(([label]) => {
  const low = parseFloat(label)                                  // '20-40m' → 20
  return (HEIGHT_LEGEND.find(([min]) => low >= min) ?? HEIGHT_LEGEND[HEIGHT_LEGEND.length - 1])[1]
}))

// 用途：取前 8 类，颜色按中文名对上三维图例
const usageColor = new Map(USAGE_LEGEND.map(u => [u[2], u[1]]))
const usageItems = computed(() => (s.value?.usage ?? []).filter(u => u[0] !== '未知').slice(0, 8))
const usageColors = computed(() => usageItems.value.map(u => usageColor.get(u[0]) ?? '#B8C1C6'))
</script>

<template>
  <div class="panel">
    <section>
      <h2>建筑着色</h2>
      <div class="seg" role="radiogroup" aria-label="建筑着色方案">
        <button v-for="m in modes" :key="m.id" role="radio" :aria-checked="twin.buildingMode === m.id"
                :class="{ on: twin.buildingMode === m.id }" @click="twin.buildingMode = m.id">{{ m.label }}</button>
      </div>
      <div class="legend" v-if="twin.buildingMode === 'height'">
        <span v-for="h in HEIGHT_LEGEND" :key="h[0]"><i :style="{ background: h[1] }" />{{ h[2] }}</span>
      </div>
      <div class="legend" v-if="twin.buildingMode === 'usage'">
        <span v-for="u in USAGE_LEGEND" :key="u[0]"><i :style="{ background: u[1] }" />{{ u[2] }}</span>
      </div>
      <h2 style="margin-top:14px">底图</h2>
      <div class="seg">
        <button :class="{ on: twin.basemap === 'ortho' }" @click="twin.basemap = 'ortho'">航拍影像</button>
        <button :class="{ on: twin.basemap === 'light' }" @click="twin.basemap = 'light'">浅色地图</button>
      </div>
      <small class="hint">点击任意建筑查看 PLATEAU 属性：用途、高度、容积率、浸水深等。</small>
    </section>

    <section v-if="s">
      <h2>千代田区建筑 <small>PLATEAU 2025 年度</small></h2>
      <div class="kpis">
        <div><span class="num big">{{ s.total.toLocaleString() }}</span><small>栋建筑</small></div>
        <div><span class="num big">{{ s.medianHeight }}<i>m</i></span><small>高度中位数</small></div>
        <div><span class="num big">{{ s.maxHeight }}<i>m</i></span><small>最高</small></div>
      </div>
      <h2 style="margin-top:12px">高度分布</h2>
      <BarChart :items="heightItems" :colors="heightColors" unit=" 栋" />
      <h2 style="margin-top:12px">用途构成 <small>不含用途未知 {{ s.usage.find(u => u[0] === '未知')?.[1] ?? 0 }} 栋</small></h2>
      <BarChart :items="usageItems" :colors="usageColors" unit=" 栋" />
    </section>

    <section v-if="s">
      <h2>最高的 5 栋</h2>
      <div class="row" v-for="b in s.tallest.slice(0, 5)" :key="b.h + b.address">
        <span class="k">{{ b.name ?? b.address.replace('東京都千代田区', '') }}</span>
        <span class="v num">{{ b.h }} m</span>
      </div>
    </section>
  </div>
</template>

<style scoped src="./panel.css"></style>
