export type IntervalHost = {
  setInterval(callback: () => void, delay: number): number
  clearInterval(handle: number): void
}

export type GameTimerOptions = {
  tickIntervalMs: number
  autoSaveIntervalMs: number
  onTick: () => void
  onAutoSave: () => void
}

export function scheduleGameTimers(
  host: IntervalHost,
  options: GameTimerOptions,
): () => void {
  let active = true
  const runWhileActive = (callback: () => void) => () => {
    if (active) {
      callback()
    }
  }
  const tickTimer = host.setInterval(
    runWhileActive(options.onTick),
    options.tickIntervalMs,
  )
  const autoSaveTimer = host.setInterval(
    runWhileActive(options.onAutoSave),
    options.autoSaveIntervalMs,
  )

  return () => {
    active = false
    host.clearInterval(tickTimer)
    host.clearInterval(autoSaveTimer)
  }
}
