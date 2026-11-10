<!--
  顶栏：产品名、四个工作模式切换、东京时间、当前天气。
  模式决定左侧面板显示什么：运行 / 建筑 / 防灾 / 分析。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTwin, type Mode } from '../stores/twin'

const twin = useTwin()
const modes: { id: Mode; label: string }[] = [
  { id: 'ops', label: '运行' },
  { id: 'buildings', label: '建筑' },
  { id: 'flood', label: '防灾' },
  { id: 'analysis', label: '分析' },
]

// 东京时间，每秒刷新
const now = ref(new Date())
let t = 0
onMounted(() => { t = window.setInterval(() => (now.value = new Date()), 1000) })
onBeforeUnmount(() => clearInterval(t))
const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' })
const clock = computed(() => fmt.format(now.value))
const date = computed(() => fmtDate.format(now.value))

const w = computed(() => twin.weather)
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9.5" fill="#fff" stroke="#1F8F4E" stroke-width="5" /></svg>
      <div>
        <h1>Chiyoda Twin</h1>
        <p>千代田区 城市运行孪生</p>
      </div>
    </div>

    <nav class="modes" aria-label="工作模式">
      <button v-for="m in modes" :key="m.id" :class="{ on: twin.mode === m.id }" :aria-pressed="twin.mode === m.id" @click="twin.mode = m.id">
        {{ m.label }}
      </button>
    </nav>

    <div class="now">
      <div class="clock">
        <span class="num t">{{ clock }}</span>
        <span class="d">东京 {{ date }}</span>
      </div>
      <div class="wx" v-if="w" :title="`来源：${w.source === 'JMA' ? '气象厅 AMeDAS 东京站' : 'Open-Meteo（气象厅数据暂不可用）'}`">
        <span class="num t">{{ w.temp ?? '–' }}°</span>
        <span class="d">
          湿度 <b class="num">{{ w.humidity ?? '–' }}%</b>
          风 <b class="num">{{ w.wind?.toFixed(1) ?? '–' }} m/s</b>
          <template v-if="w.precipitation"> · 降水 <b class="num">{{ w.precipitation }} mm/h</b></template>
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top {
  display: flex; align-items: center; gap: 24px;
  padding: 8px 14px 8px 12px;
  background: var(--paper);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow);
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand h1 { margin: 0; font: 700 19px/1.1 var(--num); letter-spacing: 0.01em; }
.brand p { margin: 0; font-size: 12px; color: var(--ink-2); }
.modes { display: flex; gap: 2px; background: var(--mist); padding: 3px; border-radius: 8px; }
.modes button { border: 0; background: none; padding: 5px 16px; border-radius: var(--radius-ctl); font-weight: 600; color: var(--ink-2); }
.modes button:hover { color: var(--ink); }
.modes button.on { background: #fff; color: var(--toei); box-shadow: 0 1px 2px rgba(0,0,0,.1); }
.now { margin-left: auto; display: flex; gap: 22px; align-items: center; }
.clock, .wx { display: flex; align-items: baseline; gap: 8px; }
.t { font-size: 22px; font-weight: 600; }
.d { font-size: 12px; color: var(--ink-2); }
.d b { font-weight: 600; color: var(--ink); font-size: 13px; }
@media (max-width: 1100px) { .wx .d { display: none; } }
@media (max-width: 760px) {
  .top { flex-wrap: wrap; gap: 8px; }
  .now { margin-left: 0; }
  .brand p { display: none; }
}
</style>
