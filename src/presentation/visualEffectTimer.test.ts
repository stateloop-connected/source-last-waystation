import { describe, expect, it, vi } from 'vitest'
import {
  createVisualEffectTimer,
  type VisualEffectTimeoutHost,
} from './visualEffectTimer'

class FakeTimeoutHost implements VisualEffectTimeoutHost {
  private nextHandle = 1
  readonly callbacks = new Map<number, () => void>()
  readonly cleared: number[] = []

  setTimeout(callback: () => void): number {
    const handle = this.nextHandle
    this.nextHandle += 1
    this.callbacks.set(handle, callback)
    return handle
  }

  clearTimeout(handle: number): void {
    this.cleared.push(handle)
  }

  fire(handle: number): void {
    this.callbacks.get(handle)?.()
  }
}

describe('visual effect timer', () => {
  it('只执行最后一次计划的队列消费', () => {
    const host = new FakeTimeoutHost()
    const timer = createVisualEffectTimer(host)
    const first = vi.fn()
    const second = vi.fn()

    timer.schedule(first, 900)
    timer.schedule(second, 900)
    host.fire(1)
    host.fire(2)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    expect(host.cleared).toContain(1)
  })

  it('clear 后已排队的旧回调不能执行', () => {
    const host = new FakeTimeoutHost()
    const timer = createVisualEffectTimer(host)
    const callback = vi.fn()

    timer.schedule(callback, 900)
    timer.clear()
    host.fire(1)

    expect(callback).not.toHaveBeenCalled()
    expect(host.cleared).toEqual([1])
  })
})
