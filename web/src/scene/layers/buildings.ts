/**
 * 建筑图层：着色方案切换、点击拾取高亮。
 *
 * 3D Tiles 样式语言说明：
 *   ${feature['属性名']} 取当前要素的属性。属性名带冒号（bldg:usage）时必须用这种写法。
 *   conditions 从上到下匹配，命中第一条就停，最后一条 'true' 是兜底。
 */
import * as Cesium from 'cesium'

export type BuildingMode = 'texture' | 'height' | 'usage' | 'flood'

/**
 * 把可能缺失的属性安全地转成数字。
 * 有的建筑没有高度、不在浸水区就没有浸水深字段，直接比较 undefined >= 150 会让 Cesium 报错并停止渲染。
 * isNaN(Number(undefined)) 为 true，此时取 -1，不会命中任何“≥ 某值”的条件。
 */
const num = (expr: string) => `(isNaN(Number(${expr})) ? -1 : Number(${expr}))`

const H = num("${feature['bldg:measuredHeight']}")
const U = "${feature['bldg:usage']}"

/** 高度分档配色：由浅到深的蓝绿，越高越深（顺序色阶，适合连续数值） */
export const HEIGHT_LEGEND: [number, string, string][] = [
  [150, '#0E3D52', '150 m 以上'],
  [100, '#1F6478', '100–150 m'],
  [60, '#3A8C97', '60–100 m'],
  [40, '#6DB0AE', '40–60 m'],
  [20, '#A9D1C6', '20–40 m'],
  [0, '#DDEBE3', '20 m 以下'],
]

/** 用途配色（分类色，彼此区分明显） */
export const USAGE_LEGEND: [string, string, string][] = [
  ['業務施設', '#4A6FA5', '办公'],
  ['商業施設', '#E0884B', '商业'],
  ['宿泊施設', '#B5658F', '酒店'],
  ['共同住宅', '#7FB36A', '集合住宅'],
  ['住宅', '#A8CF8E', '独立住宅'],
  ['店舗等併用住宅', '#D9B85C', '店住混合'],
  ['店舗等併用共同住宅', '#C9A447', '店住混合(集合)'],
  ['官公庁施設', '#5E5BA8', '政府机关'],
  ['文教厚生施設', '#3E9C9C', '文教医疗'],
  ['運輸倉庫施設', '#8A7A6A', '交通仓储'],
]

/** 浸水深配色：按日本洪水风险图的通用色阶（浅黄 → 粉 → 红 → 紫） */
export const FLOOD_LEGEND: [number, string, string][] = [
  [5, '#8E3F9E', '5 m 以上'],
  [3, '#D2506B', '3–5 m'],
  [0.5, '#F2A0A8', '0.5–3 m'],
  [0.0001, '#F7E78A', '0.5 m 以下'],
]

/**
 * 应用着色方案
 * @param floodField  flood 模式下使用的“浸水深”字段名
 * @param threshold   flood 模式下只给浸水深 ≥ 阈值的建筑上色，其余变灰
 */
export function applyBuildingStyle(ts: Cesium.Cesium3DTileset, mode: BuildingMode, floodField?: string, threshold = 0) {
  if (mode === 'texture') {
    ts.style = undefined              // 清掉样式 = 显示原始纹理
    return
  }
  if (mode === 'height') {
    ts.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          ...HEIGHT_LEGEND.map(([min, c]) => [`${H} >= ${min}`, `color('${c}')`]),
          ['true', "color('#E4E8EA')"],          // 没有高度数据
        ],
      },
    })
    return
  }
  if (mode === 'usage') {
    ts.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          ...USAGE_LEGEND.map(([k, c]) => [`${U} === '${k}'`, `color('${c}')`]),
          ['true', "color('#D5DADD')"],
        ],
      },
    })
    return
  }
  // flood：字段名里有日文括号等字符，同样用 feature['...'] 写法
  const D = num(`\${feature['${floodField}']}`)
  ts.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        [`${D} < ${Math.max(threshold, 0.0001)}`, "color('#E6E9EB', 0.92)"],
        ...FLOOD_LEGEND.map(([min, c]) => [`${D} >= ${min}`, `color('${c}')`]),
        ['true', "color('#E6E9EB', 0.92)"],
      ],
    },
  })
}

/** 选中建筑后在面板里显示的字段（属性名 → 中文标签） */
const PICK_FIELDS: [string, string][] = [
  ['gml:name', '名称'],
  ['bldg:usage', '用途'],
  ['bldg:measuredHeight', '实测高度 (m)'],
  ['bldg:storeysAboveGround', '地上层数'],
  ['bldg:storeysBelowGround', '地下层数'],
  ['bldg:address', '地址'],
  ['uro:BuildingDetailAttribute_uro:fireproofStructureType', '耐火结构'],
  ['uro:BuildingDetailAttribute_uro:districtsAndZonesType', '用途地域'],
  ['uro:BuildingDetailAttribute_uro:specifiedFloorAreaRate', '指定容积率 (%)'],
  ['uro:BuildingDetailAttribute_uro:specifiedBuildingCoverageRate', '指定建蔽率 (%)'],
  ['uro:BuildingDetailAttribute_uro:surveyYear', '调查年份'],
  ['uro:BuildingIDAttribute_uro:buildingID', '建筑 ID'],
]

export interface PickedBuilding {
  title: string
  rows: [string, string][]
  flood: [string, number][]       // 各场景的浸水深
}

/** 把被点中的 3D Tiles 要素读成面板数据 */
export function readBuilding(f: Cesium.Cesium3DTileFeature): PickedBuilding {
  const get = (k: string) => {
    const v = f.getProperty(k)
    return v === undefined || v === null || v === '' ? null : v
  }
  const rows: [string, string][] = []
  for (const [k, label] of PICK_FIELDS) {
    const v = get(k)
    if (v !== null && k !== 'gml:name') rows.push([label, String(v)])
  }
  const flood: [string, number][] = []
  for (const id of f.getPropertyIds()) {
    if (id.endsWith('_浸水深')) {
      const v = get(id)
      if (typeof v === 'number' && v > 0) flood.push([id.replace(/_浸水深$/, '').replace(/（都道府県管理区間）/, ''), v])
    }
  }
  return { title: (get('gml:name') as string) || (get('bldg:address') as string) || '建筑', rows, flood }
}

/** 选中高亮：把要素颜色改成高亮色，记住原色，切换选中时还原 */
export class Highlighter {
  private feature: Cesium.Cesium3DTileFeature | null = null
  private original = new Cesium.Color()
  set(f: Cesium.Cesium3DTileFeature | null) {
    if (this.feature) {
      try { this.feature.color = this.original } catch { /* 瓦片已被卸载 */ }
    }
    this.feature = f
    if (f) {
      Cesium.Color.clone(f.color, this.original)
      f.color = Cesium.Color.fromCssColorString('#FFD23F')
    }
  }
}
