import { computed, readonly, ref } from 'vue'
import { type MaybeRefOrGetter, toRef } from '@vueuse/core'

export interface TimerConfig {
  /**
   * 更新频率，若指定小于等于 0 的值，那么会使用最大帧率
   * 在计时器开始或重置或结束时，会强制进行一次刷新
   */
  fps?: MaybeRefOrGetter<number>

  /**
   * 是否立即开始，默认为 false
   */
  immediate?: boolean
}

/**
 * 毫秒计时器
 */
export function useTimer(config: TimerConfig = {}) {
  const { fps = 0, immediate = false } = config

  const time = ref(0)
  const isStarted = ref(false)
  let frameId = 0
  let beginTime = 0
  let lastUpdate = 0
  let lastTimeElapsed = 0

  const computedFps = toRef(fps)
  const interval = computed(() => (computedFps.value <= 0 ? 0 : 1000 / computedFps.value))

  const updateTime = () => {
    const now = performance.now()
    time.value = now - beginTime
    lastUpdate = now
  }

  const tick = () => {
    const now = performance.now()
    if (now - lastUpdate > interval.value) {
      updateTime()
    }
    if (isStarted.value) {
      frameId = requestAnimationFrame(tick)
    }
  }

  const start = () => {
    if (isStarted.value) {
      return
    }
    beginTime = performance.now() - lastTimeElapsed
    isStarted.value = true
    frameId = requestAnimationFrame(tick)
    updateTime()
  }

  const stop = () => {
    if (!isStarted.value) {
      return
    }
    cancelAnimationFrame(frameId)
    lastTimeElapsed = performance.now() - beginTime
    isStarted.value = false
    updateTime()
  }

  const reset = () => {
    const now = performance.now()
    beginTime = now
    lastUpdate = now
    lastTimeElapsed = 0
    time.value = 0
  }

  if (immediate) {
    start()
  }

  return {
    time: readonly(time),
    isStarted: readonly(isStarted),
    start,
    stop,
    reset
  }
}
