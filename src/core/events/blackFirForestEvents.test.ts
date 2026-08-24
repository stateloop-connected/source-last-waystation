import { describe, expect, it } from 'vitest'
import { createNewGame } from '../commands/createNewGame'
import { startExpedition } from '../commands/startExpedition'
import { ADVENTURE_EVENTS } from '../content/events'
import type { GameState } from '../model/gameState'
import { JOURNAL_CATEGORIES } from '../model/journal'
import { advanceTo } from '../simulation/advanceTo'

const NOW = 2_000_000_000_000

function start(seed: number): GameState {
  const result = startExpedition(
    createNewGame(NOW),
    {
      heroIds: ['ron', 'eve'],
      regionId: 'black-fir-forest',
      policy: 'explore',
      seed,
    },
    NOW,
  )
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.state
}

describe('black fir forest event integration', () => {
  it('六个正式事件均为可序列化纯数据', () => {
    expect(ADVENTURE_EVENTS).toHaveLength(6)
    expect(JSON.parse(JSON.stringify(ADVENTURE_EVENTS))).toEqual(
      ADVENTURE_EVENTS,
    )

    const visit = (value: unknown): void => {
      expect(typeof value).not.toBe('function')
      if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) {
          visit(child)
        }
      }
    }
    visit(ADVENTURE_EVENTS)
  })

  it('六个事件都通过正式选择与解析器生成合法日志及范围内结果', () => {
    const seen = new Map<string, GameState>()
    let sawWolfSuccess = false
    let sawWolfFailure = false

    for (let index = 1; index <= 500; index += 1) {
      const seed = Math.imul(index, 0x9e3779b9) >>> 0
      const resolved = advanceTo(start(seed), NOW + 15_000)
      const entry = resolved.journal.find((candidate) =>
        candidate.id.endsWith('-event-1'),
      )
      if (entry === undefined) {
        throw new Error(`seed=${seed} 未生成事件日志。`)
      }
      seen.set(entry.title, resolved)
      expect(JOURNAL_CATEGORIES).toContain(entry.category)
      expect(entry.text.length).toBeGreaterThan(0)
      expect(resolved.activeExpedition?.rngState).toSatisfy(
        (value: number | undefined) =>
          value !== undefined && Number.isSafeInteger(value) && value > 0,
      )
      if (entry.title === '遭遇迷雾狼') {
        sawWolfSuccess ||= entry.text.includes('能力检定成功。')
        sawWolfFailure ||= entry.text.includes('能力检定失败。')
      }
      if (seen.size === 6 && sawWolfSuccess && sawWolfFailure) {
        break
      }
    }

    expect([...seen.keys()].sort()).toEqual(
      ADVENTURE_EVENTS.map((event) => event.title).sort(),
    )
    expect(sawWolfSuccess).toBe(true)
    expect(sawWolfFailure).toBe(true)

    expect(seen.get('平静行进')?.activeExpedition?.carriedLoot).toEqual({
      wood: 0,
      coins: 0,
      food: 0,
      medicine: 0,
    })
    expect(
      seen.get('发现木材')?.activeExpedition?.carriedLoot.wood,
    ).toBeGreaterThanOrEqual(2)
    expect(
      seen.get('发现木材')?.activeExpedition?.carriedLoot.wood,
    ).toBeLessThanOrEqual(5)
    expect(
      seen.get('发现旧钱币')?.activeExpedition?.carriedLoot.coins,
    ).toBeGreaterThanOrEqual(2)
    expect(
      seen.get('发现旧钱币')?.activeExpedition?.carriedLoot.coins,
    ).toBeLessThanOrEqual(5)
    expect(
      seen.get('发现草药')?.activeExpedition?.carriedLoot.medicine,
    ).toBeGreaterThanOrEqual(1)
    expect(
      seen.get('发现草药')?.activeExpedition?.carriedLoot.medicine,
    ).toBeLessThanOrEqual(2)

    const lostTrail = seen.get('迷路受伤')
    const lostTrailDamage =
      210 -
      (lostTrail?.heroes
        .filter((hero) => ['ron', 'eve'].includes(hero.id))
        .reduce((sum, hero) => sum + hero.health, 0) ?? 210)
    expect(lostTrailDamage).toBeGreaterThanOrEqual(5)
    expect(lostTrailDamage).toBeLessThanOrEqual(12)
  })
})
