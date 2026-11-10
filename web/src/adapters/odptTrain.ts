/**
 * ODPT（公共交通开放数据中心）列车适配器
 *
 * ODPT 的 odpt:Train 不给经纬度，只给“从 A 站开往 B 站”。
 * 我们用预处理好的 lines.json（每个车站在轨道上的里程），把它换算成“线路上第几米”，
 * 场景层再沿真实轨道折线插值出三维坐标。
 */
import { getApi, getJson } from './http'
import type { Line, Train } from './types'

/** ODPT 原始列车对象里我们用到的字段 */
interface OdptTrain {
  'owl:sameAs': string
  'dc:date': string
  'odpt:railway': string
  'odpt:trainNumber': string
  'odpt:fromStation': string
  'odpt:toStation'?: string | null
  'odpt:destinationStation'?: string[]
  'odpt:trainType'?: string
  'odpt:railDirection'?: string
  'odpt:delay'?: number | null
}

// 列车种别 ID → 中文显示名（ODPT 的 TrainType 是日文，这里做个小字典）
const TRAIN_TYPE_ZH: Record<string, string> = {
  Local: '各停', Rapid: '快速', Express: '急行', LimitedExpress: '特急',
  AirportRapidLimitedExpress: '机场快特', AccessExpress: 'Access 特急', CommuterLimitedExpress: '通勤特急',
  RapidLimitedExpress: '快特',
}

// 方向 ID → 中文
const DIRECTION_ZH: Record<string, string> = {
  Northbound: '北行', Southbound: '南行', Eastbound: '东行', Westbound: '西行',
  InnerLoop: '内环', OuterLoop: '外环', Inbound: '上行', Outbound: '下行',
}

/** 取 ID 最后一段：odpt.Station:Toei.Mita.Hakusan → Hakusan */
const tail = (id = '') => id.split('.').pop() || id

/** 加载线路几何（一次即可） */
export async function loadLines(): Promise<Line[]> {
  const raw = await getJson<Record<string, Omit<Line, 'id'>>>('/data/lines.json')
  return Object.entries(raw).map(([id, l]) => ({ id, ...l }))
}

/**
 * 拉取一次列车位置，并换算成里程。
 * @param lines  loadLines() 的结果
 * @returns      列车列表 + 数据是否陈旧
 */
export async function fetchTrains(lines: Line[]) {
  const env = await getApi<OdptTrain[]>('/api/trains')
  // 建一个“车站 ID → { 线路, 里程, 名字 }”的索引，后面 O(1) 查询
  const index = new Map<string, { line: Line; m: number; title: string }>()
  for (const line of lines) for (const s of line.stations) index.set(s.id, { line, m: s.m, title: s.title })
  // 有些终点站在别的公司线路上（如浅草线直通京急），不在索引里，用 ID 尾巴凑合显示
  const titleOf = (id?: string | null) => (id ? index.get(id)?.title ?? tail(id) : null)

  const trains: Train[] = []
  for (const t of env.data) {
    const from = index.get(t['odpt:fromStation'])
    if (!from) continue                                   // 找不到出发站坐标：跳过
    const to = t['odpt:toStation'] ? index.get(t['odpt:toStation']) : undefined
    trains.push({
      id: t['owl:sameAs'],
      number: t['odpt:trainNumber'],
      lineId: t['odpt:railway'],
      fromStation: t['odpt:fromStation'],
      toStation: t['odpt:toStation'] ?? null,
      fromTitle: from.title,
      toTitle: to?.title ?? null,
      destination: titleOf(t['odpt:destinationStation']?.[0]) ?? '—',
      trainType: TRAIN_TYPE_ZH[tail(t['odpt:trainType'])] ?? tail(t['odpt:trainType']) ?? '',
      direction: DIRECTION_ZH[tail(t['odpt:railDirection'])] ?? '',
      delay: t['odpt:delay'] ?? 0,                        // 字段缺失视为准点
      observedAt: Date.parse(t['dc:date']),
      fromM: from.m,
      toM: to ? to.m : from.m,                            // 停站：起止里程相同
    })
  }
  return { trains, stale: env.stale, fetchedAt: env.fetchedAt }
}

/** 运行信息（延误、停运公告） */
export async function fetchTrainInfo() {
  const env = await getApi<{ 'odpt:railway': string; 'odpt:trainInformationText'?: { ja: string } }[]>('/api/train-info')
  return env.data.map(x => ({ lineId: x['odpt:railway'], text: x['odpt:trainInformationText']?.ja ?? '' }))
}
