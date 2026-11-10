/**
 * 气象适配器：主数据源是日本气象厅 AMeDAS（10 分钟一次，真实观测），
 * 失败时降级到 Open-Meteo（模型值），保证顶栏天气始终有数。
 */
import { getApi } from './http'
import { CITY } from '../config/city'
import type { WeatherStation } from './types'

export interface WeatherNow {
  source: 'JMA' | 'Open-Meteo'
  time: string
  temp: number | null
  humidity: number | null
  wind: number | null
  windDirDeg: number | null    // 风从哪个方向来，度
  precipitation: number | null
  stations: WeatherStation[]   // 周边气象站（降级时为空）
}

/** 气象厅 16 方位编号 → 角度。1=北北东(22.5°) … 16=北(360°)，0=静稳 */
export const dir16ToDeg = (d: number | null) => (d && d > 0 ? d * 22.5 : null)

export async function fetchWeather(): Promise<WeatherNow> {
  try {
    const r = await getApi<{ time: string; stations: WeatherStation[] }>('/api/amedas')
    const main = r.data.stations.find(s => s.id === CITY.amedasMain) ?? r.data.stations[0]
    return {
      source: 'JMA', time: r.data.time,
      temp: main.temp, humidity: main.humidity, wind: main.wind,
      windDirDeg: dir16ToDeg(main.windDirection), precipitation: main.precipitation1h,
      stations: r.data.stations,
    }
  } catch {
    // 降级：Open-Meteo
    const r = await getApi<{ current: Record<string, number | string> }>('/api/weather')
    const c = r.data.current
    return {
      source: 'Open-Meteo', time: String(c.time),
      temp: Number(c.temperature_2m), humidity: Number(c.relative_humidity_2m),
      wind: Number(c.wind_speed_10m) / 3.6,               // km/h → m/s
      windDirDeg: Number(c.wind_direction_10m), precipitation: Number(c.precipitation),
      stations: [],
    }
  }
}

/** 降雨临近预报：返回最近的若干个时刻（basetime 与 validtime） */
export async function fetchNowcastTimes() {
  const r = await getApi<{ basetime: string; validtime: string }[]>('/api/nowcast-times')
  return r.data
}

/** 拼出某一时刻的降雨瓦片 URL 模板（气象厅支持跨域，直接从浏览器请求） */
export const nowcastUrl = (basetime: string, validtime: string) =>
  `https://www.jma.go.jp/bosai/jmatile/data/nowc/${basetime}/none/${validtime}/surf/hrpns/{z}/{x}/{y}.png`
