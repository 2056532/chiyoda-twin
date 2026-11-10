/**
 * 航班 + 巴士图层
 *  - 航班：OpenSky 的三维位置（含高度），飞机图标按航向旋转，并画一根垂线连到地面，看得出高度
 *  - 巴士：都营巴士 GTFS-RT 位置，小方块
 */
import * as Cesium from 'cesium'
import type { Bus, Flight } from '../../adapters/types'

function planeIcon() {
  const c = document.createElement('canvas')
  c.width = c.height = 48
  const g = c.getContext('2d')!
  g.translate(24, 24)
  g.fillStyle = '#26323A'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 2.5
  g.beginPath()
  // 简化飞机剪影：机身、机翼、尾翼，机头朝上（正北）
  g.moveTo(0, -20); g.lineTo(3, -12); g.lineTo(3, -4); g.lineTo(18, 4); g.lineTo(18, 8); g.lineTo(3, 4)
  g.lineTo(3, 13); g.lineTo(8, 17); g.lineTo(8, 20); g.lineTo(0, 18); g.lineTo(-8, 20); g.lineTo(-8, 17)
  g.lineTo(-3, 13); g.lineTo(-3, 4); g.lineTo(-18, 8); g.lineTo(-18, 4); g.lineTo(-3, -4); g.lineTo(-3, -12)
  g.closePath(); g.stroke(); g.fill()
  return c
}

function busIcon() {
  const c = document.createElement('canvas')
  c.width = c.height = 20
  const g = c.getContext('2d')!
  g.fillStyle = '#1F8F4E'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 2.5
  g.beginPath(); g.roundRect(3, 3, 14, 14, 3); g.stroke(); g.fill()
  return c
}

export class MobilityLayer {
  private flights = new Cesium.CustomDataSource('flights')
  private buses = new Cesium.CustomDataSource('buses')
  private plane = planeIcon()
  private bus = busIcon()

  constructor(viewer: Cesium.Viewer) {
    viewer.dataSources.add(this.flights)
    viewer.dataSources.add(this.buses)
    this.flights.show = false
    this.buses.show = false
  }

  updateFlights(list: Flight[]) {
    this.flights.entities.removeAll()
    for (const f of list) {
      const alt = Math.max(0, f.alt || 0)
      const top = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, alt)
      this.flights.entities.add({
        id: `flight:${f.icao24}`,
        position: top,
        billboard: {
          image: this.plane, width: 30, height: 30,
          // 航向是相对正北顺时针，billboard 的 rotation 是逆时针，所以取负
          rotation: Cesium.Math.toRadians(-(f.heading ?? 0)),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,   // 绕当地竖直轴旋转，图标朝向才是地理方向
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: f.callsign || f.icao24,
          font: '600 12px "Barlow Semi Condensed", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#26323A'), outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -24),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        polyline: alt > 50 ? {   // 高度垂线
          positions: [Cesium.Cartesian3.fromDegrees(f.lon, f.lat, 0), top],
          width: 1, material: Cesium.Color.fromCssColorString('#26323A').withAlpha(0.35),
        } : undefined,
        properties: { kind: 'flight', flight: f },
      })
    }
  }

  updateBuses(list: Bus[]) {
    this.buses.entities.removeAll()
    for (const b of list) {
      this.buses.entities.add({
        id: `bus:${b.id}`,
        position: Cesium.Cartesian3.fromDegrees(b.lon, b.lat, 4),
        billboard: { image: this.bus, width: 13, height: 13, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        properties: { kind: 'bus', bus: b },
      })
    }
  }

  set showFlights(v: boolean) { this.flights.show = v }
  set showBuses(v: boolean) { this.buses.show = v }
}
