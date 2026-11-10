<!--
  底部线路条：仿车厢内 LCD 线路图。
  把一条线路“拉直”成一根横条，车站是刻度，列车是在横条上移动的圆点。
  三维场景里列车挤在一起看不清，这里能一眼看出发车间隔和哪里有延误。

  点击线路标识切换线路；点击列车圆点选中该列车（右侧显示详情，镜头跟随）。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTwin } from '../stores/twin'
import { getScene } from '../scene/manager'
import { lineColor } from '../scene/layers/trains'
import LineBadge from './LineBadge.vue'

const twin = useTwin()
const active = ref('odpt.Railway:Toei.Mita')       // 默认显示三田线（贯穿千代田区南北）
const line = computed(() => twin.lines.find(l => l.id === active.value))
const total = computed(() => line.value ? line.value.cum[line.value.cum.length - 1] : 1)

// 千代田区内车站的 ID 后缀：线路条上加粗显示，提示“这一段在孪生范围内”
const CHIYODA = new Set(['Uchisaiwaicho', 'Hibiya', 'Otemachi', 'Jimbocho', 'Suidobashi', 'Kudanshita', 'Ogawamachi', 'Iwamotocho', 'Ichigaya', 'Iidabashi'])
const isChiyoda = (id: string) => CHIYODA.has(id.split('.').pop() || '')

// 每 500 毫秒从场景层取一次列车估算里程（不用每帧，横条上肉眼看不出差别）
const dots = ref<{ id: string; x: number; dir: number; delayed: boolean; number: string; dest: string }[]>([])
let timer = 0
function refresh() {
  const sc = getScene()
  if (!sc || !line.value) return
  dots.value = sc.trains.snapshot()
    .filter(r => r.train.lineId === active.value)
    .map(r => ({
      id: r.train.id,
      x: r.m / total.value,
      dir: Math.sign(r.train.toM - r.train.fromM),   // +1 往终点方向，-1 往起点方向，0 停站
      delayed: r.train.delay >= 60,
      number: r.train.number,
      dest: r.train.destination,
    }))
}
onMounted(() => { refresh(); timer = window.setInterval(refresh, 500) })
onBeforeUnmount(() => clearInterval(timer))

function pickLine(id: string) {
  active.value = id
  twin.focusLine = twin.focusLine === null ? null : id
  refresh()
}
function pickTrain(id: string) {
  twin.selection = { kind: 'train', id }
  twin.followTrain = id
}
function toggleFocus() {
  twin.focusLine = twin.focusLine === active.value ? null : active.value
}
</script>

<template>
  <section class="strip" v-if="line" :style="{ '--c': lineColor(line) }" aria-label="线路运行图">
    <div class="pick" role="tablist" aria-label="选择线路">
      <button v-for="l in twin.lines" :key="l.id" role="tab" :aria-selected="l.id === active"
              :class="{ on: l.id === active }" :title="l.title.ja" @click="pickLine(l.id)">
        <LineBadge :line="l" :size="24" />
      </button>
    </div>

    <div class="head">
      <div class="name">{{ line.title.ja }}</div>
      <div class="meta">
        <span class="num">{{ twin.trainsByLine.get(line.id)?.length ?? 0 }}</span> 列在线
        <button class="focus" :class="{ on: twin.focusLine === line.id }" @click="toggleFocus">
          {{ twin.focusLine === line.id ? '取消突出' : '在地图上突出' }}
        </button>
      </div>
    </div>

    <div class="track">
      <div class="rail" />
      <div v-for="(s, i) in line.stations" :key="s.id" class="stop" :class="{ cz: isChiyoda(s.id), end: i === 0 || i === line.stations.length - 1 }"
           :style="{ left: (s.m / total * 100) + '%' }">
        <i />
        <span :class="{ up: i % 2 === 1 }">{{ s.title }}</span>
      </div>
      <button v-for="d in dots" :key="d.id" class="train" :class="{ late: d.delayed, sel: twin.followTrain === d.id, still: d.dir === 0 }"
              :style="{ left: (d.x * 100) + '%' }" :title="`${d.number} 开往 ${d.dest}`" @click="pickTrain(d.id)">
        <b v-if="d.dir !== 0" :class="d.dir > 0 ? 'fw' : 'bw'" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: auto 170px 1fr;
  align-items: center;
  gap: 16px;
  padding: 10px 18px 10px 12px;
  background: var(--paper);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow);
  border-top: 4px solid var(--c);      /* 线路色只出现在顶边，像车门上方的线路图 */
}
.pick { display: grid; grid-template-columns: repeat(3, auto); gap: 2px; }
.pick button { border: 0; background: none; padding: 3px; border-radius: 50%; opacity: 0.5; }
.pick button.on, .pick button:hover { opacity: 1; }
.pick button.on { background: var(--mist); }
.head .name { font-weight: 700; font-size: 16px; }
.head .meta { color: var(--ink-2); font-size: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.head .meta .num { font-size: 16px; font-weight: 700; color: var(--ink); }
.focus { border: 1px solid var(--rule); background: #fff; border-radius: var(--radius-ctl); padding: 0 8px; font-size: 12px; line-height: 22px; }
.focus.on { background: var(--c); border-color: var(--c); color: #fff; }

.track { position: relative; height: 64px; margin: 0 28px; }
.rail { position: absolute; left: 0; right: 0; top: 31px; height: 6px; border-radius: 3px; background: var(--c); }
.stop { position: absolute; top: 0; height: 100%; transform: translateX(-50%); }
.stop i { position: absolute; left: -5px; top: 29px; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid var(--c); }
.stop.end i { width: 12px; height: 12px; left: -6px; top: 28px; border-width: 3px; }
.stop span { position: absolute; left: 50%; top: 44px; transform: translateX(-50%); white-space: nowrap; font-size: 11px; color: var(--ink-3); }
.stop span.up { top: 6px; }
.stop.cz span { color: var(--ink); font-weight: 700; }
.train {
  position: absolute; top: 24px; width: 20px; height: 20px; margin-left: -10px; padding: 0;
  border-radius: 50%; border: 3px solid #fff; background: var(--ink);
  box-shadow: 0 1px 3px rgba(0,0,0,.3);
  transition: left 0.5s linear;
}
.train.still { background: #fff; border-color: var(--ink); }
.train.late { background: var(--warn); }
.train.sel { box-shadow: 0 0 0 3px var(--toei); }
.train b { position: absolute; top: 4px; width: 0; height: 0; border: 3px solid transparent; }
.train b.fw { left: 9px; border-left: 4px solid #fff; }
.train b.bw { left: 1px; border-right: 4px solid #fff; }

@media (max-width: 900px) {
  .strip { grid-template-columns: auto 1fr; gap: 6px 12px; }
  .pick { grid-template-columns: repeat(6, auto); }
  .track { grid-column: 1 / -1; }
  .track { margin: 0 12px; }
  .stop span { display: none; }
  .stop.cz span, .stop.end span { display: block; }
}
</style>
