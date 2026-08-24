export type RngResult<T> = {
  value: T
  nextState: number
}

export type WeightedOption<T> = {
  value: T
  weight: number
}

const NON_ZERO_FALLBACK_STATE = 0x6d2b79f5
const UINT32_RANGE = 0x1_0000_0000

export function normalizeRngState(state: number): number {
  if (!Number.isFinite(state)) {
    return NON_ZERO_FALLBACK_STATE
  }

  const normalized = Math.trunc(state) >>> 0
  return normalized === 0 ? NON_ZERO_FALLBACK_STATE : normalized
}

// xorshift32 keeps all entropy in one serializable unsigned 32-bit state.
export function nextUint32(state: number): RngResult<number> {
  let nextState = normalizeRngState(state)
  nextState ^= nextState << 13
  nextState ^= nextState >>> 17
  nextState ^= nextState << 5
  nextState >>>= 0

  return { value: nextState, nextState }
}

export function nextFloat(state: number): RngResult<number> {
  const result = nextUint32(state)
  return {
    value: result.value / UINT32_RANGE,
    nextState: result.nextState,
  }
}

export function randomInt(
  state: number,
  minInclusive: number,
  maxInclusive: number,
): RngResult<number> {
  if (
    !Number.isSafeInteger(minInclusive) ||
    !Number.isSafeInteger(maxInclusive) ||
    minInclusive > maxInclusive
  ) {
    throw new RangeError('随机整数范围无效。')
  }

  const random = nextFloat(state)
  const size = maxInclusive - minInclusive + 1
  return {
    value: minInclusive + Math.floor(random.value * size),
    nextState: random.nextState,
  }
}

export function weightedChoice<T>(
  state: number,
  options: readonly WeightedOption<T>[],
): RngResult<T> {
  const fallback = options[options.length - 1]
  if (fallback === undefined) {
    throw new RangeError('加权随机选项不能为空。')
  }

  let totalWeight = 0
  for (const option of options) {
    if (!Number.isFinite(option.weight) || option.weight <= 0) {
      throw new RangeError('加权随机选项的权重必须大于零。')
    }
    totalWeight += option.weight
  }

  const random = nextFloat(state)
  const target = random.value * totalWeight
  let cumulativeWeight = 0

  for (const option of options) {
    cumulativeWeight += option.weight
    if (target < cumulativeWeight) {
      return { value: option.value, nextState: random.nextState }
    }
  }

  return { value: fallback.value, nextState: random.nextState }
}
