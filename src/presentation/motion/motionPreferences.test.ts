import { describe, expect, it } from 'vitest'
import {
  MOTION_PREFERENCES_STORAGE_KEY,
  loadMotionPreference,
  parseMotionPreference,
  resolveMotionPreference,
  saveMotionPreference,
  serializeMotionPreference,
  type MotionPreferenceStorage,
} from './motionPreferences'

class MemoryStorage implements MotionPreferenceStorage {
  private readonly values = new Map<string, string>()
  failReads = false
  failWrites = false

  getItem(key: string): string | null {
    if (this.failReads) {
      throw new Error('读取失败')
    }
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('写入失败')
    }
    this.values.set(key, value)
  }

  read(key: string): string | null {
    return this.values.get(key) ?? null
  }
}

describe('motion preference parsing', () => {
  it.each(['system', 'full', 'reduced', 'off'] as const)(
    '解析合法偏好 %s',
    (preference) => {
      expect(parseMotionPreference(serializeMotionPreference(preference))).toBe(
        preference,
      )
    },
  )

  it.each([
    null,
    '',
    '{',
    'null',
    '"full"',
    '{}',
    '{"motion":"fast"}',
    '{"motion":null}',
  ])('对缺失、非法 JSON 或非法值 %j 回退到 system', (stored) => {
    expect(parseMotionPreference(stored)).toBe('system')
  })

  it('按系统设置解析有效动画级别', () => {
    expect(resolveMotionPreference('system', false)).toBe('full')
    expect(resolveMotionPreference('system', true)).toBe('reduced')
    expect(resolveMotionPreference('full', true)).toBe('full')
    expect(resolveMotionPreference('reduced', false)).toBe('reduced')
    expect(resolveMotionPreference('off', false)).toBe('off')
  })
})

describe('motion preference storage', () => {
  it('没有已存偏好时默认跟随系统', () => {
    expect(loadMotionPreference(new MemoryStorage())).toBe('system')
  })

  it('使用独立 key 保存并恢复合法偏好', () => {
    const storage = new MemoryStorage()

    expect(saveMotionPreference('off', storage)).toBe(true)
    expect(storage.read(MOTION_PREFERENCES_STORAGE_KEY)).toBe(
      '{"motion":"off"}',
    )
    expect(loadMotionPreference(storage)).toBe('off')
  })

  it('读取异常时安全回退到 system', () => {
    const storage = new MemoryStorage()
    storage.failReads = true

    expect(loadMotionPreference(storage)).toBe('system')
  })

  it('写入异常时返回 false 且不抛出', () => {
    const storage = new MemoryStorage()
    storage.failWrites = true

    expect(saveMotionPreference('reduced', storage)).toBe(false)
    expect(storage.read(MOTION_PREFERENCES_STORAGE_KEY)).toBeNull()
  })

  it('存储不可用时也保持安全默认值', () => {
    expect(loadMotionPreference(null)).toBe('system')
    expect(saveMotionPreference('full', null)).toBe(false)
  })
})
