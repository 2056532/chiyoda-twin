/**
 * 共享单车图层：每个站点一根立柱，柱高 = 可借车数，颜色 = 满桩率。
 * 用 Cesium 的 cylinder（圆柱体）实体实现；数量在 300 个以内，性能没问题。
 */
import * as Cesium from 'cesium'
import type { BikeStation } from '../../adapters/types'

const METERS_PER_BIKE = 4       // 每辆车对应柱高 4 米：普通站 20–40 米，与周边中层建筑相当，不会盖过城市本身

/** 可借率 → 颜色：0（借不到，红）→ 0.5（黄）→ 1（充足，绿） */
export function availabilityColor(ratio: number) {
  const stops = [
    [0, [214, 69, 80]],
    [0.25, [242, 163, 58]],
    [0.6, [133, 196, 104]],
    [1, [31, 143, 78]],
  ] as const
  for (let i = 1; i < stops.length; i++) {
    const [r1, c1] = stops[i - 1], [r2, c2] = stops[i]
    if (ratio <= r2) {
      const t = (ratio - r1) / (r2 - r1)
      return Cesium.Color.fromBytes(...(c1.map((v, k) => Math.round(v + (c2[k] - v) * t)) as [number, number, number]), 235)
    }
  }
  return Cesium.Color.fromBytes(31, 143, 78, 235)
}

export class BikeLayer {
  private ds = new Cesium.CustomDataSource('bikes')
  private stations = new Map<string, BikeStation>()

  constructor(viewer: Cesium.Viewer) {
    viewer.dataSources.add(this.ds)
  }

  /**
   * 更新柱子。
   * @param counts 可选：历史回放时传入 { station_id: 可借车数 }，覆盖实时值
   */
  update(stations: BikeStation[], counts?: Record<string, number>) {
    for (const s of stations) {
      this.stations.set(s.id, s)
      const bikes = counts?.[s.id] ?? s.bikes
      const ratio = s.capacity ? Math.min(1, bikes / s.capacity) : 0
      const h = Math.max(4, bikes * METERS_PER_BIKE)
      let e = this.ds.entities.getById(`bike:${s.id}`)
      if (!e) {
        e = this.ds.entities.add({
          id: `bike:${s.id}`,
          // 圆柱的位置是中心点，所以高度要放在柱高的一半
          position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, h / 2),
          cylinder: { length: h, topRadius: 9, bottomRadius: 9, material: availabilityColor(ratio), slices: 16 },
          properties: { kind: 'bike', stationId: s.id },
        })
      } else {
        e.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(s.lon, s.lat, h / 2))
        e.cylinder!.length = new Cesium.ConstantProperty(h)
        e.cylinder!.material = new Cesium.ColorMaterialProperty(availabilityColor(ratio))
      }
    }
  }

  get(id: string) { return this.stations.get(id) }
  set show(v: boolean) { this.ds.show = v }
}
