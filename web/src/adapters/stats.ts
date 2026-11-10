/** 建筑统计（tools/build_stats.py 预处理生成） */
import { getJson } from './http'

export interface Scenario {
  title: string
  tiles: string          // 浸水区域 3D Tiles 目录名
  field: string          // 建筑属性里对应的“浸水深”字段名
  affected: number       // 浸水深 > 0 的建筑数
  maxDepth: number
  depths: number[]       // 所有受影响建筑的浸水深，已升序排列
}

export interface BuildingStats {
  total: number
  withHeight: number
  maxHeight: number
  medianHeight: number
  heightHist: { label: string; count: number }[]
  usage: [string, number][]
  tallest: { h: number; name: string | null; address: string }[]
  scenarios: Record<string, Scenario>
}

export const loadStats = () => getJson<BuildingStats>('/data/buildings_stats.json')

/**
 * 统计浸水深 ≥ threshold 的建筑数。
 * depths 已升序，用二分查找找到第一个 ≥ threshold 的位置，后面的都满足。
 */
export function countAtLeast(depths: number[], threshold: number) {
  let lo = 0, hi = depths.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (depths[mid] < threshold) lo = mid + 1
    else hi = mid
  }
  return depths.length - lo
}
