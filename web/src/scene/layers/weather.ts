/**
 * 气象图层
 *  - 降雨临近预报：气象厅 5 分钟一更新的雨量瓦片，叠加为半透明影像
 *  - AMeDAS 气象站：站点位置画风向箭头 + 气温标签
 */
import * as Cesium from 'cesium'
import type { WeatherStation } from '../../adapters/types'
import { dir16ToDeg, nowcastUrl } from '../../adapters/weather'

/** 画一个风向箭头图标（箭头指向风吹去的方向），按角度缓存 */
const arrowCache = new Map<number, HTMLCanvasElement>()
function windArrow(deg: number) {
  const k = Math.round(deg)
  if (arrowCache.has(k)) return arrowCache.get(k)!
  const c = document.createElement('canvas')
  c.width = c.height = 40
  const g = c.getContext('2d')!
  g.translate(20, 20)
  g.rotate(((k + 180) * Math.PI) / 180)   // 气象上的风向是“风从哪来”，箭头画成“往哪吹”，所以 +180°
  g.beginPath()
  g.moveTo(0, -15); g.lineTo(7, 4); g.lineTo(2, 2); g.lineTo(2, 14); g.lineTo(-2, 14); g.lineTo(-2, 2); g.lineTo(-7, 4)
  g.closePath()
  g.fillStyle = '#2F5D8A'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 2.5
  g.stroke(); g.fill()
  arrowCache.set(k, c)
  return c
}

export class WeatherLayer {
  private ds = new Cesium.CustomDataSource('amedas')
  private rain: Cesium.ImageryLayer | null = null
  private rainKey = ''
  private rainShow = false

  constructor(private viewer: Cesium.Viewer) {
    viewer.dataSources.add(this.ds)
    this.ds.show = false
  }

  updateStations(list: WeatherStation[]) {
    this.ds.entities.removeAll()
    for (const s of list) {
      const deg = dir16ToDeg(s.windDirection)
      this.ds.entities.add({
        id: `amedas:${s.id}`,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 60),
        billboard: deg !== null ? {
          image: windArrow(deg), width: 30, height: 30,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
        label: {
          text: `${s.name} ${s.temp ?? '–'}°C${s.wind != null ? ` · ${s.wind} m/s` : ''}`,
          font: '600 13px "Barlow Semi Condensed", "PingFang SC", "Microsoft YaHei", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#1E3B57'), outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, 24),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }
  }

  /** 切换到某一时刻的降雨图 */
  setRainTime(basetime: string, validtime: string) {
    const key = basetime + validtime
    if (key === this.rainKey) return
    this.rainKey = key
    const layer = new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
      url: nowcastUrl(basetime, validtime),
      maximumLevel: 10,          // 气象厅雨量瓦片最高 10 级，再放大由 Cesium 拉伸
      minimumLevel: 4,
      credit: new Cesium.Credit('気象庁 高解像度降水ナウキャスト'),
    }), { alpha: 0.78 })
    layer.show = this.rainShow
    this.viewer.imageryLayers.add(layer)       // 加在影像最上层
    if (this.rain) this.viewer.imageryLayers.remove(this.rain, true)
    this.rain = layer
  }

  set showRain(v: boolean) { this.rainShow = v; if (this.rain) this.rain.show = v }
  set showStations(v: boolean) { this.ds.show = v }
}
