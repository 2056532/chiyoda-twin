<!--
  运行模式面板：都营地铁总览、各线运行状态、共享单车供需、图层开关、单车历史回放。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useTwin } from '../../stores/twin'
import LineBadge from '../LineBadge.vue'

const twin = useTwin()

/** ODPT 公开端点不提供列车位置的线路（只有线路和车站数据） */
const NO_REALTIME = new Set(['odpt.Railway:Toei.NipporiToneri'])

/** 运行信息文字简化：ODPT 正常时返回“現在、１５分以上の遅延はありません。” */
const statusOf = (lineId: string) => {
  const t = twin.trainInfo.find(i => i.lineId === lineId)?.text ?? ''
  if (!t || t.includes('遅延はありません') || t.includes('平常')) return { ok: true, text: '正常运行' }
  return { ok: false, text: t }
}

const lineRows = computed(() => twin.lines.map(l => {
  const list = twin.trainsByLine.get(l.id) ?? []
  return { line: l, count: list.length, delayed: list.filter(t => t.delay >= 60).length, status: statusOf(l.id), hidden: twin.hiddenLines.includes(l.id) }
}))

function toggleLine(id: string) {
  twin.hiddenLines = twin.hiddenLines.includes(id) ? twin.hiddenLines.filter(x => x !== id) : [...twin.hiddenLines, id]
}

// 单车回放：滑块 0..N-1 是历史快照，N 是“实时”
const histLen = computed(() => twin.bikeHistory.length)
const replayValue = computed({
  get: () => twin.bikeReplayIndex ?? histLen.value,
  set: (v: number) => { twin.bikeReplayIndex = v >= histLen.value ? null : v },
})
const replayLabel = computed(() => {
  if (twin.bikeReplayIndex === null) return '实时'
  const t = twin.bikeHistory[twin.bikeReplayIndex]?.t
  return t ? new Date(t).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : ''
})
const bt = computed(() => twin.bikeTotals)
</script>

<template>
  <div class="panel">
    <section>
      <h2>都营地铁</h2>
      <div class="kpis">
        <div><span class="num big">{{ twin.trains.length }}</span><small>在线列车</small></div>
        <div><span class="num big">{{ twin.runningTrains.length }}</span><small>区间行驶</small></div>
        <div :class="{ warn: twin.delayedTrains.length }"><span class="num big">{{ twin.delayedTrains.length }}</span><small>延误 ≥ 1 分钟</small></div>
      </div>
      <p class="src" :class="{ stale: twin.trainsStale }">
        {{ twin.trainsStale ? '上游暂不可用，显示的是缓存数据' : 'ODPT 约 30 秒更新一次' }}
        <template v-if="twin.trainsAt"> · 取数 {{ new Date(twin.trainsAt).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Tokyo' }) }}</template>
      </p>
      <ul class="lines">
        <li v-for="r in lineRows" :key="r.line.id" :class="{ off: r.hidden }">
          <LineBadge :line="r.line" :size="24" />
          <div class="ln">
            <b>{{ r.line.title.ja }}</b>
            <span :class="r.status.ok ? 'ok' : 'bad'" :title="r.status.text">{{ r.status.text }}</span>
          </div>
          <span class="num cnt" v-if="r.count || !NO_REALTIME.has(r.line.id)">{{ r.count }}<small> 列</small></span>
          <span class="na" v-else title="ODPT 公开端点暂未提供这条线的列车位置">无实时数据</span>
          <span class="num late" v-if="r.delayed">{{ r.delayed }} 延误</span>
          <button class="eye" :aria-label="r.hidden ? '显示线路' : '隐藏线路'" :aria-pressed="!r.hidden" @click="toggleLine(r.line.id)">
            {{ r.hidden ? '显示' : '隐藏' }}
          </button>
        </li>
      </ul>
    </section>

    <section>
      <h2>共享单车 <small>docomo bike share · 千代田区周边 {{ bt.stations }} 站</small></h2>
      <div class="kpis">
        <div><span class="num big">{{ bt.avail }}</span><small>可借车辆</small></div>
        <div><span class="num big">{{ Math.round(bt.ratio * 100) }}<i>%</i></span><small>平均在桩率</small></div>
        <div :class="{ warn: bt.empty }"><span class="num big">{{ bt.empty }}</span><small>无车可借站点</small></div>
      </div>
      <label class="sw"><input type="checkbox" v-model="twin.show.bikes" /> 在地图上显示站点立柱 <small>（柱高 = 可借车数）</small></label>
      <div class="replay" v-if="twin.show.bikes">
        <div class="rl"><span>历史回放</span><b class="num">{{ replayLabel }}</b></div>
        <input type="range" min="0" :max="histLen" step="1" v-model.number="replayValue" :disabled="histLen < 2" aria-label="单车历史回放时刻" />
        <small v-if="histLen < 2">后端每 5 分钟存一次快照，运行一段时间后就能回放。目前已存 {{ histLen }} 个。</small>
        <small v-else>已存 {{ histLen }} 个快照（最近 24 小时），拖到最右回到实时。</small>
      </div>
      <div class="legend" v-if="twin.show.bikes">
        <span><i style="background:#D64550" />无车</span><span><i style="background:#F2A33A" />紧张</span>
        <span><i style="background:#85C468" />适中</span><span><i style="background:#1F8F4E" />充足</span>
      </div>
    </section>

    <section>
      <h2>更多实时图层</h2>
      <label class="sw"><input type="checkbox" v-model="twin.show.trains" /> 地铁线路与列车</label>
      <label class="sw"><input type="checkbox" v-model="twin.show.buses" /> 都营巴士 <small>（GTFS-RT，{{ twin.buses.length }} 辆）</small></label>
      <label class="sw"><input type="checkbox" v-model="twin.show.rain" /> 降雨临近预报 <small>（气象厅，5 分钟）</small></label>
      <label class="sw"><input type="checkbox" v-model="twin.show.amedas" /> 气象站风向与气温 <small>（AMeDAS）</small></label>
      <label class="sw"><input type="checkbox" v-model="twin.show.flights" /> 航班 <small>（OpenSky，{{ twin.flights.length }} 架）</small></label>
    </section>
  </div>
</template>

<style scoped src="./panel.css"></style>
