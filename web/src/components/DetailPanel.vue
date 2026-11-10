<!--
  右侧详情面板：显示当前选中的对象（建筑 / 列车 / 车站 / 单车站 / 航班）。
  没有选中时显示操作提示。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useTwin } from '../stores/twin'
import LineBadge from './LineBadge.vue'

const twin = useTwin()
const sel = computed(() => twin.selection)

const train = computed(() => {
  const s = sel.value
  return s?.kind === 'train' ? twin.trains.find(t => t.id === s.id) : undefined
})
const trainLine = computed(() => twin.lines.find(l => l.id === train.value?.lineId))

const station = computed(() => {
  if (sel.value?.kind !== 'station') return undefined
  const line = twin.lines.find(l => l.id === (sel.value as { lineId: string }).lineId)
  const st = line?.stations.find(s => s.id === (sel.value as { id: string }).id)
  if (!line || !st) return undefined
  // 正在本站停车 / 正驶向本站 的列车
  const here = twin.trains.filter(t => t.lineId === line.id && ((t.fromStation === st.id && !t.toStation) || t.toStation === st.id))
  return { line, st, here }
})

const bike = computed(() => (sel.value?.kind === 'bike' ? twin.bikes.find(b => b.id === (sel.value as { id: string }).id) : undefined))
const flight = computed(() => (sel.value?.kind === 'flight' ? sel.value.data : undefined))

function close() { twin.selection = null; twin.followTrain = null }
</script>

<template>
  <aside class="detail" v-if="sel" aria-live="polite">
    <button class="x" aria-label="关闭详情" @click="close">×</button>

    <!-- 建筑 -->
    <template v-if="sel.kind === 'building'">
      <p class="kind">建筑</p>
      <h3>{{ sel.data.title }}</h3>
      <div class="row" v-for="[k, v] in sel.data.rows" :key="k"><span class="k">{{ k }}</span><span class="v">{{ v }}</span></div>
      <template v-if="sel.data.flood.length">
        <p class="kind" style="margin-top:12px">想定浸水深</p>
        <div class="row" v-for="[k, v] in sel.data.flood" :key="k"><span class="k">{{ k }}</span><span class="v num">{{ v.toFixed(2) }} m</span></div>
      </template>
      <p v-else class="muted">不在任何浸水想定区域内。</p>
    </template>

    <!-- 列车 -->
    <template v-else-if="sel.kind === 'train' && train && trainLine">
      <p class="kind"><LineBadge :line="trainLine" :size="22" /> {{ trainLine.title.ja }}</p>
      <h3><span class="num">{{ train.number }}</span> 开往 {{ train.destination }}</h3>
      <div class="row"><span class="k">种别</span><span class="v">{{ train.trainType }}</span></div>
      <div class="row"><span class="k">方向</span><span class="v">{{ train.direction }}</span></div>
      <div class="row"><span class="k">当前位置</span>
        <span class="v">{{ train.toTitle ? `${train.fromTitle} → ${train.toTitle}` : `停靠 ${train.fromTitle}` }}</span></div>
      <div class="row"><span class="k">延误</span>
        <span class="v" :class="{ warn: train.delay >= 60 }">{{ train.delay >= 60 ? `${Math.round(train.delay / 60)} 分钟` : '准点' }}</span></div>
      <div class="row"><span class="k">数据时刻</span><span class="v num">{{ new Date(train.observedAt).toLocaleTimeString('zh-CN', { hour12: false }) }}</span></div>
      <label class="follow"><input type="checkbox" :checked="twin.followTrain === train.id" @change="twin.followTrain = ($event.target as HTMLInputElement).checked ? train!.id : null" /> 镜头跟随这列车</label>
      <p class="muted">位置按站间里程和平均速度估算，ODPT 每次更新时校正。</p>
    </template>
    <template v-else-if="sel.kind === 'train'">
      <h3>列车已下线</h3>
      <p class="muted">这列车已不在最新数据中（可能已到终点或驶出都营线路）。</p>
    </template>

    <!-- 车站 -->
    <template v-else-if="sel.kind === 'station' && station">
      <p class="kind"><LineBadge :line="station.line" :size="22" /> {{ station.line.title.ja }}</p>
      <h3>{{ station.st.title }}</h3>
      <p class="kind" style="margin-top:8px">停靠中 / 即将到站</p>
      <div class="row" v-for="t in station.here" :key="t.id">
        <span class="k"><span class="num">{{ t.number }}</span> 开往 {{ t.destination }}</span>
        <span class="v">{{ t.toStation ? '即将到站' : '停靠中' }}</span>
      </div>
      <p v-if="!station.here.length" class="muted">暂无列车。</p>
    </template>

    <!-- 单车站 -->
    <template v-else-if="sel.kind === 'bike' && bike">
      <p class="kind">共享单车站</p>
      <h3>{{ bike.name }}</h3>
      <div class="bikebar" :aria-label="`可借 ${bike.bikes}，空桩 ${bike.docks}`">
        <i :style="{ width: (bike.bikes / Math.max(1, bike.bikes + bike.docks) * 100) + '%' }" />
      </div>
      <div class="row"><span class="k">可借车辆</span><span class="v num">{{ bike.bikes }}</span></div>
      <div class="row"><span class="k">可还空桩</span><span class="v num">{{ bike.docks }}</span></div>
      <div class="row"><span class="k">额定容量</span><span class="v num">{{ bike.capacity }}</span></div>
    </template>

    <!-- 航班 -->
    <template v-else-if="sel.kind === 'flight' && flight">
      <p class="kind">航班</p>
      <h3 class="num">{{ flight.callsign || flight.icao24 }}</h3>
      <div class="row"><span class="k">注册国</span><span class="v">{{ flight.country }}</span></div>
      <div class="row"><span class="k">高度</span><span class="v num">{{ Math.round(flight.alt) }} m</span></div>
      <div class="row"><span class="k">地速</span><span class="v num">{{ flight.velocity ? Math.round(flight.velocity * 3.6) + ' km/h' : '–' }}</span></div>
      <div class="row"><span class="k">航向</span><span class="v num">{{ flight.heading != null ? Math.round(flight.heading) + '°' : '–' }}</span></div>
      <div class="row"><span class="k">ICAO24</span><span class="v num">{{ flight.icao24 }}</span></div>
    </template>
  </aside>
</template>

<style scoped>
.detail {
  position: relative;
  width: 300px;
  max-height: 100%;
  overflow: auto;
  padding: 14px 16px 16px;
  background: var(--paper);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow);
}
.x { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border: 0; background: none; font-size: 20px; color: var(--ink-3); border-radius: 50%; }
.x:hover { background: var(--mist); color: var(--ink); }
.kind { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-size: 12px; color: var(--ink-2); }
h3 { margin: 0 28px 10px 0; font-size: 18px; line-height: 1.3; }
.row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-top: 1px solid var(--mist); font-size: 13px; }
.k { color: var(--ink-2); }
.v { font-weight: 600; text-align: right; }
.v.num { font-size: 15px; }
.warn { color: var(--warn); }
.muted { font-size: 12px; color: var(--ink-3); margin: 8px 0 0; }
.follow { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; }
.follow input { accent-color: var(--toei); }
.bikebar { height: 12px; border-radius: 6px; background: var(--mist); overflow: hidden; margin-bottom: 6px; }
.bikebar i { display: block; height: 100%; background: var(--toei); }
@media (max-width: 760px) { .detail { width: auto; } }
</style>
