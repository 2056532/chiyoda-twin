/**
 * 全局状态（Pinia）：只放“数据”和“界面开关”，不放 Cesium 对象。
 * Cesium 对象非常大，放进响应式系统会被深度代理，性能急剧下降，所以它们放在 scene/manager.ts 里。
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { BikeStation, Bus, Flight, Line, Train } from '../adapters/types'
import type { WeatherNow } from '../adapters/weather'
import type { BuildingStats } from '../adapters/stats'
import type { BuildingMode, PickedBuilding } from '../scene/layers/buildings'

export type Mode = 'ops' | 'buildings' | 'flood' | 'analysis'

/** 右侧详情面板当前显示的对象 */
export type Selection =
  | { kind: 'building'; data: PickedBuilding }
  | { kind: 'train'; id: string }
  | { kind: 'station'; id: string; lineId: string }
  | { kind: 'bike'; id: string }
  | { kind: 'flight'; data: Flight }
  | null

export const useTwin = defineStore('twin', () => {
  // ---------- 数据（shallowRef：整体替换才触发更新，数组内部不做深度代理，性能更好）
  const lines = shallowRef<Line[]>([])
  const trains = shallowRef<Train[]>([])
  const trainsAt = ref<string | null>(null)
  const trainsStale = ref(false)
  const trainInfo = shallowRef<{ lineId: string; text: string }[]>([])
  const bikes = shallowRef<BikeStation[]>([])
  const bikeHistory = shallowRef<{ t: string; a: Record<string, number> }[]>([])
  const weather = shallowRef<WeatherNow | null>(null)
  const flights = shallowRef<Flight[]>([])
  const buses = shallowRef<Bus[]>([])
  const stats = shallowRef<BuildingStats | null>(null)

  // ---------- 界面状态
  const mode = ref<Mode>('ops')
  const selection = shallowRef<Selection>(null)
  const followTrain = ref<string | null>(null)       // 镜头跟随的列车
  const sceneReady = ref(false)
  const loadingText = ref('正在加载三维城市模型…')

  const show = ref({ trains: true, bikes: false, buses: false, flights: false, rain: false, amedas: false })
  const hiddenLines = ref<string[]>([])
  const focusLine = ref<string | null>(null)

  const buildingMode = ref<BuildingMode>('texture')
  const basemap = ref<'ortho' | 'light'>('ortho')
  const floodScenario = ref('kanda_l2')
  const floodThreshold = ref(0.5)                    // 只统计、着色浸水深 ≥ 该值的建筑（米）

  const sun = ref({ on: false, date: new Date().toISOString().slice(0, 10), hour: 14 })
  const underground = ref(false)
  const bikeReplayIndex = ref<number | null>(null)   // null = 实时；数字 = 回放到第几个快照

  // ---------- 派生数据
  const delayedTrains = computed(() => trains.value.filter(t => t.delay >= 60))
  const runningTrains = computed(() => trains.value.filter(t => t.toStation))
  const trainsByLine = computed(() => {
    const m = new Map<string, Train[]>()
    for (const t of trains.value) {
      if (!m.has(t.lineId)) m.set(t.lineId, [])
      m.get(t.lineId)!.push(t)
    }
    return m
  })
  const bikeTotals = computed(() => {
    const b = bikes.value
    const cap = b.reduce((s, x) => s + x.capacity, 0)
    const avail = b.reduce((s, x) => s + x.bikes, 0)
    const empty = b.filter(x => x.bikes === 0).length
    const full = b.filter(x => x.docks === 0).length
    return { stations: b.length, cap, avail, empty, full, ratio: cap ? avail / cap : 0 }
  })

  return {
    lines, trains, trainsAt, trainsStale, trainInfo, bikes, bikeHistory, weather, flights, buses, stats,
    mode, selection, followTrain, sceneReady, loadingText, show, hiddenLines, focusLine,
    buildingMode, basemap, floodScenario, floodThreshold, sun, underground, bikeReplayIndex,
    delayedTrains, runningTrains, trainsByLine, bikeTotals,
  }
})
