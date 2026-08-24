import { describe, expect, it, vi } from 'vitest'
import { scheduleGameTimers, type IntervalHost } from './saveTimers'

class FakeIntervalHost implements IntervalHost {
  private nextHandle = 1
  readonly callbacks = new Map<number, () => void>()
  readonly delays = new Map<number, number>()
  readonly cleared: number[] = []

  setInterval(callback: () => void, delay: number): number {
    const handle = this.nextHandle++
    this.callbacks.set(handle, callback)
    this.delays.set(handle, delay)
    return handle
  }

  clearInterval(handle: number): void {
    this.cleared.push(handle)
  }

  fire(handle: number): void {
    this.callbacks.get(handle)?.()
  }
}

describe('game timers', () => {
  it('注册 1 秒推进和 5 秒自动保存并在 cleanup 中全部清理', () => {
    const host = new FakeIntervalHost()
    const onTick = vi.fn()
    const onAutoSave = vi.fn()
    const cleanup = scheduleGameTimers(host, {
      tickIntervalMs: 1_000,
      autoSaveIntervalMs: 5_000,
      onTick,
      onAutoSave,
    })

    expect([...host.delays.values()]).toEqual([1_000, 5_000])
    host.fire(1)
    host.fire(2)
    expect(onTick).toHaveBeenCalledOnce()
    expect(onAutoSave).toHaveBeenCalledOnce()

    cleanup()
    expect(host.cleared).toEqual([1, 2])
  })

  it('StrictMode cleanup 后即使旧回调已排队也不会再运行', () => {
    const host = new FakeIntervalHost()
    const onTick = vi.fn()
    const onAutoSave = vi.fn()
    const cleanup = scheduleGameTimers(host, {
      tickIntervalMs: 1_000,
      autoSaveIntervalMs: 5_000,
      onTick,
      onAutoSave,
    })

    cleanup()
    host.fire(1)
    host.fire(2)

    expect(onTick).not.toHaveBeenCalled()
    expect(onAutoSave).not.toHaveBeenCalled()
  })

  it('定时回调在导入或重置后读取最新引用', () => {
    const host = new FakeIntervalHost()
    let currentGame = '旧存档'
    const observedGames: string[] = []
    const cleanup = scheduleGameTimers(host, {
      tickIntervalMs: 1_000,
      autoSaveIntervalMs: 5_000,
      onTick: () => observedGames.push(currentGame),
      onAutoSave: () => observedGames.push(currentGame),
    })

    currentGame = '导入后的存档'
    host.fire(1)
    currentGame = '重置后的存档'
    host.fire(2)

    expect(observedGames).toEqual(['导入后的存档', '重置后的存档'])
    cleanup()
  })
})
