/**
 * 共享单车适配器（GBFS 标准，docomo bike share 东京）
 * GBFS 把“站点静态信息”和“实时车位”分成两个文件：
 *   station_information：位置、名字、容量（基本不变，后端已存到 data/raw）
 *   station_status：可借车数、可还车位（每分钟更新）
 * 前端把两者按 station_id 合并成 BikeStation。
 */
import { getApi, getJson } from './http'
import { CITY } from '../config/city'
import type { BikeStation } from './types'

interface Info { station_id: string; name: string; lat: number; lon: number; capacity: number }
interface Status { id: string; bikes: number; docks: number }

let infoCache: Info[] | null = null

/** 只保留千代田区附近的站点，全东京 1900 多个站点画出来太乱也太慢 */
async function loadInfo() {
  if (infoCache) return infoCache
  const raw = await getJson<{ data: { stations: Info[] } }>('/raw/gbfs_station_information.json')
  const b = CITY.bbox
  infoCache = raw.data.stations.filter(s => s.lon > b.west && s.lon < b.east && s.lat > b.south && s.lat < b.north)
  return infoCache
}

export async function fetchBikes(): Promise<{ stations: BikeStation[]; stale: boolean }> {
  const [info, status] = await Promise.all([loadInfo(), getApi<Status[]>('/api/bike/status')])
  const byId = new Map(status.data.map(s => [s.id, s]))   // station_id → 实时状态
  const stations = info.map(s => {
    const st = byId.get(s.station_id)
    return {
      id: s.station_id,
      name: s.name.replace(/^[A-Z0-9-]+\./, ''),            // 去掉“T2-54.”这类编号前缀
      lon: s.lon, lat: s.lat, capacity: s.capacity,
      bikes: st?.bikes ?? 0, docks: st?.docks ?? 0,
    }
  })
  return { stations, stale: status.stale }
}

/** 后端每 5 分钟存的快照：[{ t: 时间, a: { station_id: 可借车数 } }] */
export async function fetchBikeHistory() {
  const r = await getJson<{ data: { t: string; a: Record<string, number> }[] }>('/api/bike/history')
  return r.data
}
