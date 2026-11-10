<!--
  应用根组件：
   1. 挂载 Cesium 场景
   2. 启动各数据源轮询，把数据写进 Pinia
   3. 监听界面状态（watch），同步到 Cesium 图层
  也就是说：Vue 管“状态”，Cesium 管“画”，App.vue 是两者之间唯一的桥。
-->
<script setup lang="ts">
import * as Cesium from 'cesium'
import { onMounted, ref, watch } from 'vue'
import { useTwin } from './stores/twin'
import { initScene, getScene } from './scene/manager'
import { applyBuildingStyle } from './scene/layers/buildings'
import { enableShadows, setSunTime, setUnderground } from './scene/layers/analysis'
import { usePolling } from './composables/usePolling'
import { fetchTrainInfo, fetchTrains, loadLines } from './adapters/odptTrain'
import { fetchBikeHistory, fetchBikes } from './adapters/gbfs'
import { fetchNowcastTimes, fetchWeather } from './adapters/weather'
import { fetchFlights } from './adapters/flights'
import { fetchBuses } from './adapters/bus'
import { loadStats } from './adapters/stats'
import TopBar from './components/TopBar.vue'
import LineStrip from './components/LineStrip.vue'
import DetailPanel from './components/DetailPanel.vue'
import OpsPanel from './components/panels/OpsPanel.vue'
import BuildingsPanel from './components/panels/BuildingsPanel.vue'
import FloodPanel from './components/panels/FloodPanel.vue'
import AnalysisPanel from './components/panels/AnalysisPanel.vue'

const twin = useTwin()
const container = ref<HTMLDivElement>()
const fatal = ref<string | null>(null)

onMounted(async () => {
  try {
    twin.lines = await loadLines()
    loadStats().then(s => (twin.stats = s)).catch(e => console.warn('统计加载失败', e))
    await initScene(container.value!, twin.lines, t => (twin.loadingText = t), sel => {
      twin.selection = sel
      if (sel?.kind !== 'train') twin.followTrain = null
    })
    twin.sceneReady = true
    startPolling()
    startFollowLoop()
  } catch (e) {
    console.error(e)
    fatal.value = e instanceof Error ? e.message : String(e)
  }
})

// ------------------------------------------------------------ 轮询：每个数据源一个节奏
function startPolling() {
  usePolling(async () => {
    const r = await fetchTrains(twin.lines)
    twin.trains = r.trains
    twin.trainsStale = r.stale
    twin.trainsAt = r.fetchedAt
    getScene()?.trains.update(r.trains)
  }, 20_000)

  usePolling(async () => { twin.trainInfo = await fetchTrainInfo() }, 60_000)

  usePolling(async () => {
    const r = await fetchBikes()
    twin.bikes = r.stations
    twin.bikeHistory = await fetchBikeHistory()
    if (twin.bikeReplayIndex === null) getScene()?.bikes.update(r.stations)
  }, 60_000)

  usePolling(async () => {
    const w = await fetchWeather()
    twin.weather = w
    getScene()?.weather.updateStations(w.stations)
  }, 5 * 60_000)

  usePolling(async () => {
    const times = await fetchNowcastTimes()
    if (times[0]) getScene()?.weather.setRainTime(times[0].basetime, times[0].validtime)
  }, 5 * 60_000)

  // 巴士、航班只在打开图层时才请求，省流量和 OpenSky 积分
  usePolling(async () => {
    if (!twin.show.buses) return
    twin.buses = await fetchBuses()
    getScene()?.mobility.updateBuses(twin.buses)
  }, 30_000)

  usePolling(async () => {
    if (!twin.show.flights) return
    const r = await fetchFlights()
    twin.flights = r.flights
    getScene()?.mobility.updateFlights(r.flights)
  }, 60_000)
}

// ------------------------------------------------------------ 镜头跟随列车
function startFollowLoop() {
  const sc = getScene()!
  sc.viewer.scene.preRender.addEventListener(() => {
    const id = twin.followTrain
    if (!id) return
    const p = sc.trains.positionOf(id)
    if (!p) return
    // lookAt：镜头以列车为中心，保持当前朝向，距离 700 米
    const target = Cesium.Cartesian3.fromDegrees(p[0], p[1], 10)
    const cam = sc.viewer.camera
    cam.lookAt(target, new Cesium.HeadingPitchRange(cam.heading, Cesium.Math.toRadians(-35), 700))
  })
}
watch(() => twin.followTrain, id => {
  // 取消跟随后要解除 lookAt 的锁定，否则鼠标无法自由旋转
  if (!id) getScene()?.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
})

// ------------------------------------------------------------ 状态 → 场景
const sc = () => getScene()

// twin.stats 也在依赖里：防灾模式需要统计数据中的字段名，统计晚到时会自动补一次
watch(() => [twin.sceneReady, twin.stats, twin.mode, twin.buildingMode, twin.floodScenario, twin.floodThreshold] as const, () => {
  const s = sc()
  if (!s) return
  if (twin.mode === 'flood' && twin.stats) {
    const scn = twin.stats.scenarios[twin.floodScenario]
    applyBuildingStyle(s.buildings, 'flood', scn.field, twin.floodThreshold)
    s.flood.show(scn.tiles)
  } else {
    applyBuildingStyle(s.buildings, twin.buildingMode)
    s.flood.show(null)
  }
})

watch(() => [twin.sceneReady, twin.basemap] as const, () => {
  const s = sc()
  if (!s) return
  s.base.layers.ortho.show = twin.basemap === 'ortho'
  s.base.layers.light.show = twin.basemap === 'light'
})

watch(() => ({ ...twin.show, ready: twin.sceneReady }), v => {
  const s = sc()
  if (!s) return
  s.trains.setAllVisible(v.trains)
  s.bikes.show = v.bikes
  s.weather.showRain = v.rain
  s.weather.showStations = v.amedas
  s.mobility.showBuses = v.buses
  s.mobility.showFlights = v.flights
}, { deep: true })

// 打开巴士 / 航班图层时立即拉一次数据，不用等下一个轮询周期
watch(() => twin.show.buses, async on => {
  if (on) { twin.buses = await fetchBuses(); sc()?.mobility.updateBuses(twin.buses) }
})
watch(() => twin.show.flights, async on => {
  if (on) { const r = await fetchFlights(); twin.flights = r.flights; sc()?.mobility.updateFlights(r.flights) }
})

watch(() => [...twin.hiddenLines], (now, before = []) => {
  const s = sc()
  if (!s) return
  for (const l of twin.lines) if (now.includes(l.id) !== before.includes(l.id)) s.trains.setLineVisible(l.id, !now.includes(l.id))
})
watch(() => twin.focusLine, id => sc()?.trains.setFocus(id))

// 单车回放：选中历史快照时用快照里的数字画柱子
watch(() => twin.bikeReplayIndex, i => {
  const s = sc()
  if (!s) return
  s.bikes.update(twin.bikes, i === null ? undefined : twin.bikeHistory[i]?.a)
})

watch(() => ({ ...twin.sun, ready: twin.sceneReady }), v => {
  const s = sc()
  if (!s) return
  enableShadows(s.viewer, v.on)
  if (v.on) setSunTime(s.viewer, v.date, v.hour)
}, { deep: true })

watch(() => twin.underground, on => {
  const s = sc()
  if (!s) return
  setUnderground(s.viewer, on)
  const ub = s.base.tilesets.ubld
  if (ub) ub.show = on
  // 地上建筑变成半透明白模，地下街才不会被挡住；退出时恢复当前着色方案
  if (on) s.buildings.style = new Cesium.Cesium3DTileStyle({ color: "color('#FFFFFF', 0.28)" })
  else applyBuildingStyle(s.buildings, twin.buildingMode)
})

// 切换到分析以外的模式时，自动关闭地下模式和阴影，避免用户迷路
watch(() => twin.mode, m => {
  if (m !== 'analysis') { twin.underground = false; twin.sun.on = false }
})
</script>

<template>
  <div class="app">
    <div ref="container" class="globe" />

    <div class="overlay">
      <TopBar class="top" />
      <aside class="left" aria-label="控制面板">
        <OpsPanel v-if="twin.mode === 'ops'" />
        <BuildingsPanel v-else-if="twin.mode === 'buildings'" />
        <FloodPanel v-else-if="twin.mode === 'flood'" />
        <AnalysisPanel v-else />
      </aside>
      <div class="right"><DetailPanel /></div>
      <LineStrip v-if="twin.sceneReady && twin.lines.length && twin.mode === 'ops'" class="bottom" />
      <footer class="attr" v-else>
        数据：3D都市モデル（Project PLATEAU）国土交通省 · 公共交通オープンデータセンター · 気象庁 · 国土地理院 · OpenSky Network · © OpenStreetMap contributors
      </footer>
    </div>

    <div class="loading" v-if="!twin.sceneReady">
      <div class="card">
        <svg width="44" height="44" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9.5" fill="#fff" stroke="#1F8F4E" stroke-width="5" /></svg>
        <h2>Chiyoda Twin</h2>
        <p v-if="!fatal">{{ twin.loadingText }}</p>
        <p v-else class="err">场景加载失败：{{ fatal }}<br />请确认后端已启动（node server/server.mjs），并且 data/plateau 下有 3D Tiles 数据。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app { position: relative; height: 100%; }
.globe { position: absolute; inset: 0; }
/* 浮层用 grid 布局，pointer-events:none 让鼠标穿透到地图，面板自身再打开 */
.overlay {
  position: absolute; inset: 0; pointer-events: none;
  display: grid;
  grid-template-columns: 340px 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas: 'top top top' 'left . right' 'bottom bottom bottom';
  gap: 10px; padding: 10px;
}
.overlay > * { pointer-events: auto; }
.top { grid-area: top; }
.left {
  grid-area: left; overflow: auto; min-height: 0;
  background: var(--paper); border-radius: var(--radius-panel); box-shadow: var(--shadow);
  align-self: start; max-height: 100%;
}
.right { grid-area: right; min-height: 0; align-self: start; max-height: 100%; display: flex; }
.bottom { grid-area: bottom; }
.attr {
  grid-area: bottom; justify-self: start; font-size: 11px; color: var(--ink-2);
  background: rgba(255,255,255,.85); border-radius: 6px; padding: 3px 10px;
}
.loading {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: #E9EDEF; z-index: 10;
}
.card { text-align: center; }
.card h2 { margin: 10px 0 4px; font: 700 26px var(--num); }
.card p { margin: 0; color: var(--ink-2); }
.card .err { color: var(--alert); max-width: 440px; line-height: 1.6; }

@media (max-width: 900px) {
  .overlay {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto auto;
    grid-template-areas: 'top' '.' 'right' 'bottom';
  }
  .left { display: none; }
}
</style>
