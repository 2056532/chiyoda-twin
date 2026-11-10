/**
 * 都营巴士适配器：GTFS-Realtime（Google 制定的公交实时数据标准，protobuf 二进制格式）
 * 后端原样转发二进制，前端用官方的 gtfs-realtime-bindings 解码。
 */
import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { CITY } from '../config/city'
import type { Bus } from './types'

export async function fetchBuses(): Promise<Bus[]> {
  const res = await fetch('/api/bus.pb')
  if (!res.ok) throw new Error('bus ' + res.status)
  const buf = new Uint8Array(await res.arrayBuffer())                      // 读成字节数组
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf) // protobuf 解码
  const b = CITY.bbox
  const out: Bus[] = []
  for (const e of feed.entity) {
    const v = e.vehicle
    const p = v?.position
    if (!p) continue
    // 只保留千代田区附近的车辆，外扩 0.02°（约 2 公里）
    if (p.longitude < b.west - 0.02 || p.longitude > b.east + 0.02 || p.latitude < b.south - 0.02 || p.latitude > b.north + 0.02) continue
    out.push({
      id: String(e.id),
      routeId: v?.trip?.routeId ?? '',
      lon: p.longitude, lat: p.latitude,
      timestamp: Number(v?.timestamp ?? 0) * 1000,   // 秒 → 毫秒
    })
  }
  return out
}
