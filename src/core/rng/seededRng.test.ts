import { describe, expect, it } from 'vitest'
import {
  nextFloat,
  nextUint32,
  randomInt,
  weightedChoice,
} from './seededRng'

function generateSequence(seed: number, length: number): number[] {
  const values: number[] = []
  let state = seed

  for (let index = 0; index < length; index += 1) {
    const result = nextUint32(state)
    values.push(result.value)
    state = result.nextState
  }

  return values
}

describe('seeded RNG', () => {
  it('为相同种子生成相同序列', () => {
    expect(generateSequence(20260824, 8)).toEqual(
      generateSequence(20260824, 8),
    )
  })

  it('通常为不同种子生成不同序列', () => {
    expect(generateSequence(17, 8)).not.toEqual(generateSequence(18, 8))
  })

  it('可以只靠序列化后的状态继续同一序列', () => {
    const first = nextUint32(99)
    const continued = nextUint32(first.nextState)
    const restoredState = Number(String(first.nextState))
    const restored = nextUint32(restoredState)

    expect(restored).toEqual(continued)
  })

  it('产生合法的浮点数、整数和加权选择', () => {
    const float = nextFloat(1)
    const integer = randomInt(float.nextState, 2, 5)
    const choice = weightedChoice(integer.nextState, [
      { value: 'a', weight: 1 },
      { value: 'b', weight: 2 },
    ])

    expect(float.value).toBeGreaterThanOrEqual(0)
    expect(float.value).toBeLessThan(1)
    expect(integer.value).toBeGreaterThanOrEqual(2)
    expect(integer.value).toBeLessThanOrEqual(5)
    expect(['a', 'b']).toContain(choice.value)
  })

  it('拒绝无效范围和权重', () => {
    expect(() => randomInt(1, 3, 2)).toThrow('随机整数范围无效')
    expect(() => weightedChoice(1, [])).toThrow('加权随机选项不能为空')
    expect(() =>
      weightedChoice(1, [{ value: 'a', weight: 0 }]),
    ).toThrow('权重必须大于零')
  })
})
