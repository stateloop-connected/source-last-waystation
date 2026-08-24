export interface VisualEffectTimeoutHost {
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(handle: number): void
}

export type VisualEffectTimer = {
  schedule(callback: () => void, delay: number): void
  clear(): void
}

export function createVisualEffectTimer(
  host: VisualEffectTimeoutHost,
): VisualEffectTimer {
  let handle: number | null = null
  let generation = 0

  const clear = () => {
    generation += 1
    if (handle !== null) {
      host.clearTimeout(handle)
      handle = null
    }
  }

  return {
    schedule(callback, delay) {
      clear()
      const scheduledGeneration = generation
      handle = host.setTimeout(() => {
        if (generation !== scheduledGeneration) {
          return
        }
        handle = null
        callback()
      }, delay)
    },
    clear,
  }
}
