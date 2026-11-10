import type { ApiEnvelope } from './types'

/**
 * 带超时的 JSON 请求。所有适配器都走这里，方便统一处理错误。
 * @param url  相对路径，例如 /api/trains
 * @param ms   超时毫秒数，超时后抛出错误，由调用方（轮询）决定下次重试
 */
export async function getJson<T>(url: string, ms = 15000): Promise<T> {
  const ctrl = new AbortController()                 // 用来中止请求
  const timer = setTimeout(() => ctrl.abort(), ms)   // 到时间就中止
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`${res.status} ${url}`)   // 4xx / 5xx 当作失败
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)                              // 无论成功失败都清掉定时器
  }
}

/** 请求后端包装过的接口，返回 { fetchedAt, stale, data } */
export const getApi = <T>(url: string) => getJson<ApiEnvelope<T>>(url)
