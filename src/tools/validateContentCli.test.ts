import { describe, expect, it, vi } from 'vitest'
import {
  runValidateContentCli,
  type ContentValidationCliIo,
} from './validateContentCli'

function createIo(
  result: ReturnType<ContentValidationCliIo['validate']>,
): ContentValidationCliIo {
  return {
    log: vi.fn(),
    error: vi.fn(),
    validate: vi.fn(() => result),
  }
}

describe('content validation CLI', () => {
  it('returns zero and prints dynamic content counts when valid', () => {
    const io = createIo({ valid: true, errors: [], warnings: [] })

    expect(runValidateContentCli([], io)).toBe(0)
    expect(io.log).toHaveBeenCalledWith('Heroes: 3')
    expect(io.log).toHaveBeenCalledWith('Traits: 3')
    expect(io.log).toHaveBeenCalledWith('Regions: 1')
    expect(io.log).toHaveBeenCalledWith('Events: 6')
  })

  it('returns one and prints structured validation errors', () => {
    const io = createIo({
      valid: false,
      warnings: [],
      errors: [
        {
          severity: 'error',
          code: 'duplicate-event-id',
          contentId: 'duplicate',
          message: '事件 ID 重复。',
        },
      ],
    })

    expect(runValidateContentCli([], io)).toBe(1)
    expect(io.error).toHaveBeenCalledWith(
      '[error] duplicate-event-id (duplicate): 事件 ID 重复。',
    )
  })

  it('keeps warnings non-fatal and rejects unknown arguments', () => {
    const warningIo = createIo({
      valid: true,
      errors: [],
      warnings: [
        {
          severity: 'warning',
          code: 'content-warning',
          message: '测试警告。',
        },
      ],
    })
    expect(runValidateContentCli([], warningIo)).toBe(0)

    const argumentIo = createIo({ valid: true, errors: [], warnings: [] })
    expect(runValidateContentCli(['--unknown'], argumentIo)).toBe(1)
    expect(argumentIo.validate).not.toHaveBeenCalled()
  })
})
