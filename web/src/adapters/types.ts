/**
 * 数据适配层的统一类型。
 * 场景层（Cesium）和界面层（Vue 面板）只认识这些类型，不关心数据来自 ODPT、MTA 还是模拟数据。
 * 换城市时，新写一个适配器输出同样的类型即可，上层代码不用改。
 */

/** 后端统一响应格式 */
export interface ApiEnvelope<T> {
  fetchedAt: string    // 后端从上游取到数据的时间
  stale: boolean       // true 表示上游失败、返回的是旧缓存
  data: T
}

/** 线路（来自 data/derived/lines.json，由 tools/build_lines.py 生成） */
export interface Line {
  id: string
  title: { ja: string; en: string }
  color: string
  lineCode: string
  coords: [number, number][]   // 轨道折线（经度, 纬度）
  cum: number[]                // 每个折线点距起点的累计里程（米）
  stations: LineStation[]
}

export interface LineStation {
  id: string
  title: string
  lon: number
  lat: number
  m: number                    // 车站在线路上的里程（米）
}

/** 列车孪生实体 */
export interface Train {
  id: string                   // 例：odpt.Train:Toei.Asakusa.1328T
  number: string               // 车次：1328T
  lineId: string
  fromStation: string
  toStation: string | null     // null 表示正在 fromStation 停站
  fromTitle: string
  toTitle: string | null
  destination: string          // 终点站名
  trainType: string            // 列车种别（各停、急行……）
  delay: number                // 延误秒数
  direction: string            // 上下行
  observedAt: number           // ODPT 数据时间（毫秒时间戳）
  /** 起止里程：停站时两者相等；行驶时从 fromM 走向 toM */
  fromM: number
  toM: number
}

export interface BikeStation {
  id: string
  name: string
  lon: number
  lat: number
  capacity: number
  bikes: number                // 可借车数
  docks: number                // 可还车位
}

export interface WeatherStation {
  id: string
  name: string
  lon: number
  lat: number
  temp: number | null
  humidity: number | null
  wind: number | null          // 风速 m/s
  windDirection: number | null // 16 方位：1=北北东 … 16=北，0=静稳
  precipitation1h: number | null
}

export interface Flight {
  icao24: string
  callsign: string
  country: string
  lon: number
  lat: number
  alt: number                  // 米
  onGround: boolean
  velocity: number | null      // m/s
  heading: number | null       // 度，正北为 0，顺时针
}

export interface Bus {
  id: string
  routeId: string
  lon: number
  lat: number
  timestamp: number
}
