export const MAX_SAFE_QUANTITY = Number.MAX_SAFE_INTEGER

export function roundToNonNegativeSafeInteger(value: number): number {
  if (Number.isNaN(value) || value <= 0) {
    return 0
  }
  if (value >= MAX_SAFE_QUANTITY) {
    return MAX_SAFE_QUANTITY
  }
  return Math.round(value)
}

export function addNonNegativeSafeIntegers(
  left: number,
  right: number,
): number {
  if (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0
  ) {
    throw new RangeError('Only non-negative safe integers can be added.')
  }

  return right > MAX_SAFE_QUANTITY - left
    ? MAX_SAFE_QUANTITY
    : left + right
}
