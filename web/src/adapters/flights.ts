/** 航班适配器：OpenSky ADS-B 数据，经后端代理（OpenSky 不允许浏览器跨域） */
import { getApi } from './http'
import type { Flight } from './types'

export async function fetchFlights() {
  const r = await getApi<{ time: number; states: Flight[] }>('/api/flights')
  return { flights: r.data.states, time: r.data.time, stale: r.stale }
}
