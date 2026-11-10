/**
 * 地铁孪生图层
 *
 * 1. 画线路：OSM 轨道折线贴地显示，颜色用 ODPT 官方线路色
 * 2. 画车站：白底圆点 + 站名
 * 3. 画列车：每次轮询拿到“线路里程区间”，在区间内按时间推进，沿真实轨道插值出位置
 *
 * 插值逻辑（estimateMeter）：
 *   ODPT 约 30 秒更新一次。“行驶中”的列车，我们假设它在 fromM→toM 之间匀速行驶，
 *   站间运行时间按 距离 / 平均速度 估算（地铁站间平均约 35 km/h），
 *   每一帧用“距上次观测过去了多少秒”算出当前里程，再用 along() 求出坐标。
 *   这样列车会沿轨道平滑移动，而不是 30 秒跳一次。
 */
import * as Cesium from 'cesium'
import type { Line, Train } from '../../adapters/types'
import { LINE_COLOR_OVERRIDE } from '../../config/city'

const AVG_SPEED = 35 / 3.6        // 平均运行速度（米/秒）
const LINE_HEIGHT = 6             // 线路和列车离地高度（米），略高于地面避免 Z 冲突

export const lineColor = (l: Pick<Line, 'id' | 'color'>) => LINE_COLOR_OVERRIDE[l.id] ?? l.color

/** 在折线上按里程 m 取点：二分查找所在线段，再线性插值 */
export function along(line: Line, m: number): [number, number] {
  const { coords, cum } = line
  if (m <= 0) return coords[0]
  if (m >= cum[cum.length - 1]) return coords[coords.length - 1]
  let lo = 0, hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= m) lo = mid; else hi = mid
  }
  const t = (m - cum[lo]) / (cum[hi] - cum[lo] || 1)
  return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t]
}

/** 估算列车此刻的里程（米） */
export function estimateMeter(t: Train, receivedAt: number, now: number) {
  if (t.fromM === t.toM) return t.fromM                    // 停站
  const dist = Math.abs(t.toM - t.fromM)
  const runSec = Math.max(60, dist / AVG_SPEED)            // 站间至少按 1 分钟算
  // ODPT 时间戳表示“最近一次状态变化时刻”，用它和收到时间中较早者作为出发时刻
  const start = Math.min(t.observedAt || receivedAt, receivedAt)
  const k = Math.min(0.95, Math.max(0.05, (now - start) / 1000 / runSec))  // 不走到 100%，等下一次数据确认到站
  return t.fromM + (t.toM - t.fromM) * k
}

/** 一个圆角“列车”图标：线路色底 + 白边，用 canvas 画，按颜色缓存 */
const iconCache = new Map<string, HTMLCanvasElement>()
function trainIcon(color: string, delayed: boolean) {
  const key = color + delayed
  if (iconCache.has(key)) return iconCache.get(key)!
  const c = document.createElement('canvas')
  c.width = 30; c.height = 30
  const g = c.getContext('2d')!
  g.beginPath(); g.arc(15, 15, 11, 0, Math.PI * 2)
  g.fillStyle = color; g.fill()
  g.lineWidth = 3.5; g.strokeStyle = delayed ? '#F2A33A' : '#FFFFFF'; g.stroke()
  g.beginPath(); g.arc(15, 15, 3.6, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill()
  iconCache.set(key, c)
  return c
}

export class TrainLayer {
  readonly lines = new Map<string, Line>()
  private lineEntities = new Cesium.CustomDataSource('lines')
  private stationEntities = new Cesium.CustomDataSource('stations')
  private trainEntities = new Cesium.CustomDataSource('trains')
  private trains = new Map<string, { train: Train; receivedAt: number; entity: Cesium.Entity }>()
  private visibleLines = new Set<string>()
  focusLine: string | null = null

  constructor(viewer: Cesium.Viewer, lines: Line[]) {
    for (const l of lines) { this.lines.set(l.id, l); this.visibleLines.add(l.id) }
    viewer.dataSources.add(this.lineEntities)
    viewer.dataSources.add(this.stationEntities)
    viewer.dataSources.add(this.trainEntities)
    this.drawLines()
  }

  private drawLines() {
    for (const l of this.lines.values()) {
      const color = Cesium.Color.fromCssColorString(lineColor(l))
      const positions = l.coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, LINE_HEIGHT))
      // 下层：白色描边，让线路在航拍图上也清楚
      this.lineEntities.entities.add({
        id: `casing:${l.id}`,
        polyline: { positions, width: 7, material: Cesium.Color.WHITE.withAlpha(0.85), arcType: Cesium.ArcType.NONE },
      })
      this.lineEntities.entities.add({
        id: `line:${l.id}`,
        polyline: {
          positions, width: 4, material: color, arcType: Cesium.ArcType.NONE,
          // 地铁在地下，线路经常被建筑挡住。被挡住的部分用半透明虚线画出来，表示“在建筑后面 / 地下”
          depthFailMaterial: new Cesium.PolylineDashMaterialProperty({ color: color.withAlpha(0.55), dashLength: 12 }),
        },
      })
      for (const s of l.stations) {
        // 大江户线是“6”字形环线，都庁前在站序里出现两次，只画一次
        if (this.stationEntities.entities.getById(`station:${s.id}`)) continue
        this.stationEntities.entities.add({
          id: `station:${s.id}`,
          position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, LINE_HEIGHT),
          point: {
            pixelSize: 8, color: Cesium.Color.WHITE, outlineColor: color, outlineWidth: 2.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,   // 不被建筑遮挡
            scaleByDistance: new Cesium.NearFarScalar(800, 1.2, 25000, 0.5),
          },
          label: {
            text: s.title, font: '600 13px "Barlow Semi Condensed", "PingFang SC", "Microsoft YaHei", sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#1C2A33'), outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -16),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6500),   // 拉远后不显示站名
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { kind: 'station', lineId: l.id },
        })
      }
    }
  }

  /** 收到一批新数据：更新已有列车，新增新列车，删除已下线的列车 */
  update(list: Train[]) {
    const now = Date.now()
    const seen = new Set<string>()
    for (const t of list) {
      const line = this.lines.get(t.lineId)
      if (!line) continue
      seen.add(t.id)
      const old = this.trains.get(t.id)
      // 同一状态（没换区间）就保留原来的出发时刻，动画不会倒退
      const sameLeg = old && old.train.fromStation === t.fromStation && old.train.toStation === t.toStation
      const receivedAt = sameLeg ? old!.receivedAt : now
      if (old) {
        old.train = t
        old.receivedAt = receivedAt
        old.entity.billboard!.image = new Cesium.ConstantProperty(trainIcon(lineColor(line), t.delay >= 60))
        continue
      }
      const rec = { train: t, receivedAt, entity: null as unknown as Cesium.Entity }
      rec.entity = this.trainEntities.entities.add({
        id: `train:${t.id}`,
        // CallbackProperty：每一帧调用一次，返回当前插值位置
        position: new Cesium.CallbackPositionProperty(() => {
          const r = this.trains.get(t.id)!
          const [lon, lat] = along(line, estimateMeter(r.train, r.receivedAt, Date.now()))
          return Cesium.Cartesian3.fromDegrees(lon, lat, LINE_HEIGHT + 2)
        }, false),
        billboard: {
          image: trainIcon(lineColor(line), t.delay >= 60),
          width: 22, height: 22,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(600, 1.25, 30000, 0.55),
        },
        properties: { kind: 'train', trainId: t.id },
        show: this.visibleLines.has(t.lineId),
      })
      this.trains.set(t.id, rec)
    }
    for (const [id, r] of this.trains) {
      if (!seen.has(id)) { this.trainEntities.entities.remove(r.entity); this.trains.delete(id) }
    }
  }

  /** 当前每列车的估算里程，给底部线路条用 */
  snapshot() {
    const now = Date.now()
    return [...this.trains.values()].map(r => ({ train: r.train, m: estimateMeter(r.train, r.receivedAt, now) }))
  }

  getTrain(id: string) { return this.trains.get(id)?.train }

  /** 某列车此刻坐标（镜头跟随用） */
  positionOf(id: string) {
    const r = this.trains.get(id)
    if (!r) return null
    const line = this.lines.get(r.train.lineId)!
    return along(line, estimateMeter(r.train, r.receivedAt, Date.now()))
  }

  /** 显示 / 隐藏某条线路（含车站和列车） */
  setLineVisible(lineId: string, show: boolean) {
    show ? this.visibleLines.add(lineId) : this.visibleLines.delete(lineId)
    this.lineEntities.entities.getById(`line:${lineId}`)!.show = show
    this.lineEntities.entities.getById(`casing:${lineId}`)!.show = show
    for (const s of this.lines.get(lineId)!.stations) {
      const e = this.stationEntities.entities.getById(`station:${s.id}`)
      if (e) e.show = show
    }
    for (const r of this.trains.values()) if (r.train.lineId === lineId) r.entity.show = show
  }

  /** 聚焦某条线：其他线路变淡 */
  setFocus(lineId: string | null) {
    this.focusLine = lineId
    for (const l of this.lines.values()) {
      const dim = lineId !== null && l.id !== lineId
      const e = this.lineEntities.entities.getById(`line:${l.id}`)!
      e.polyline!.material = new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(lineColor(l)).withAlpha(dim ? 0.25 : 1))
      e.polyline!.width = new Cesium.ConstantProperty(dim ? 3 : lineId ? 6 : 4)
    }
  }

  setAllVisible(show: boolean) {
    this.lineEntities.show = show
    this.stationEntities.show = show
    this.trainEntities.show = show
  }
}
