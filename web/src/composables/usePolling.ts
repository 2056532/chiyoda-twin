import { getCurrentInstance, onUnmounted, ref } from 'vue'

/**
 * 通用轮询：上一次请求结束后才排下一次（setTimeout 链），网络慢时请求不会堆积。
 * 失败不会打断循环，并把错误信息暴露给界面显示。
 *
 * @param fn  每次要执行的异步任务
 * @param ms  间隔毫秒
 * @returns   { lastOk: 最近成功时间, error: 最近错误, refresh: 立即执行一次 }
 */
export function usePolling(fn: () => Promise<void>, ms: number) {
  const lastOk = ref<Date | null>(null)
  const error = ref<string | null>(null)
  let timer: number | undefined
  let stopped = false

  const tick = async () => {
    clearTimeout(timer)
    try {
      await fn()
      lastOk.value = new Date()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.warn('[polling]', error.value)
    } finally {
      if (!stopped) timer = window.setTimeout(tick, ms)
    }
  }

  tick()                                          // 立即执行第一次
  // 在组件 setup 里调用时，组件销毁就停止；在 await 之后调用（没有组件上下文）则一直运行
  if (getCurrentInstance()) onUnmounted(() => { stopped = true; clearTimeout(timer) })
  return { lastOk, error, refresh: tick }
}
