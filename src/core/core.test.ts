import { describe, expect, it } from 'vitest'
import { createNewGame } from './commands/createNewGame'
import { retreatExpedition } from './commands/retreatExpedition'
import {
  startExpedition,
  type StartExpeditionInput,
} from './commands/startExpedition'
import { upgradeWatchtower } from './commands/upgradeBuilding'
import type { GameState } from './model/gameState'
import {
  advanceTo,
  getOfflineCapHours,
  HOUR_MS,
} from './simulation/advanceTo'

const NOW = 1_800_000_000_000
const DEFAULT_INPUT: StartExpeditionInput = {
  heroIds: ['ron', 'eve'],
  regionId: 'black-fir-forest',
  policy: 'explore',
  seed: 424242,
}

function requireSuccessfulStart(
  state = createNewGame(NOW),
  input: StartExpeditionInput = DEFAULT_INPUT,
): GameState {
  const result = startExpedition(state, input, NOW)
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.state
}

function countEventEntries(state: GameState, expeditionId: string): number {
  return state.journal.filter((entry) =>
    entry.id.startsWith(`${expeditionId}-event-`),
  ).length
}

describe('createNewGame', () => {
  it('创建固定、可序列化的初始状态', () => {
    const state = createNewGame(NOW)

    expect(state.resources).toEqual({
      food: 12,
      medicine: 4,
      wood: 0,
      coins: 20,
    })
    expect(state.heroes.map((hero) => hero.name)).toEqual([
      '罗恩',
      '伊芙',
      '米娅',
    ])
    expect(state.heroes.every((hero) => hero.status === 'idle')).toBe(true)
    expect(state.activeExpedition).toBeNull()
    expect(state.journal.length).toBeGreaterThan(0)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('startExpedition', () => {
  it('要求恰好两名不同的空闲英雄', () => {
    const state = createNewGame(NOW)
    const tooFew = startExpedition(
      state,
      { ...DEFAULT_INPUT, heroIds: ['ron'] },
      NOW,
    )
    const duplicate = startExpedition(
      state,
      { ...DEFAULT_INPUT, heroIds: ['ron', 'ron'] },
      NOW,
    )
    const unavailableState: GameState = {
      ...state,
      heroes: state.heroes.map((hero) =>
        hero.id === 'ron' ? { ...hero, status: 'injured' } : hero,
      ),
    }
    const unavailable = startExpedition(
      unavailableState,
      DEFAULT_INPUT,
      NOW,
    )

    expect(tooFew.ok).toBe(false)
    expect(tooFew.ok ? '' : tooFew.error).toContain('两名不同')
    expect(duplicate.ok ? '' : duplicate.error).toContain('两名不同')
    expect(unavailable.ok ? '' : unavailable.error).toContain('无法出发')
  })

  it('拒绝食物不足和已有远征的状态', () => {
    const state = createNewGame(NOW)
    const hungry = startExpedition(
      { ...state, resources: { ...state.resources, food: 1 } },
      DEFAULT_INPUT,
      NOW,
    )
    const started = requireSuccessfulStart(state)
    const repeated = startExpedition(started, DEFAULT_INPUT, NOW)

    expect(hungry.ok ? '' : hungry.error).toContain('食物不足')
    expect(repeated.ok ? '' : repeated.error).toContain('已有远征队')
  })

  it('扣除食物并把选中英雄设为远征状态', () => {
    const started = requireSuccessfulStart()

    expect(started.resources.food).toBe(10)
    expect(
      started.heroes
        .filter((hero) => DEFAULT_INPUT.heroIds.includes(hero.id))
        .every((hero) => hero.status === 'expedition'),
    ).toBe(true)
    expect(started.activeExpedition?.processedEventCount).toBe(0)
    expect(started.activeExpedition?.nextEventAt).toBe(NOW + 15_000)
  })
})

describe('advanceTo', () => {
  it('到期前不处理事件，到期时恰好处理一次', () => {
    const started = requireSuccessfulStart()
    const expeditionId = started.activeExpedition?.id
    if (expeditionId === undefined) {
      throw new Error('测试远征创建失败。')
    }

    const before = advanceTo(started, NOW + 14_999)
    const due = advanceTo(before, NOW + 15_000)

    expect(before.activeExpedition?.processedEventCount).toBe(0)
    expect(countEventEntries(before, expeditionId)).toBe(0)
    expect(due.activeExpedition?.processedEventCount).toBe(1)
    expect(countEventEntries(due, expeditionId)).toBe(1)
  })

  it('一次大步推进不会漏掉事件，并在第六个事件后结算', () => {
    const started = requireSuccessfulStart()
    const expeditionId = started.activeExpedition?.id
    if (expeditionId === undefined) {
      throw new Error('测试远征创建失败。')
    }

    const completed = advanceTo(started, NOW + 90_000)

    expect(countEventEntries(completed, expeditionId)).toBe(6)
    expect(completed.activeExpedition).toBeNull()
    expect(completed.completedExpeditions).toBe(1)
  })

  it('重复推进同一时间不会重复结算', () => {
    const once = advanceTo(requireSuccessfulStart(), NOW + 30_000)
    const twice = advanceTo(once, NOW + 30_000)

    expect(twice).toBe(once)
  })

  it('分段推进与直接推进到同一时刻完全等价', () => {
    const started = requireSuccessfulStart()
    const segmented = advanceTo(
      advanceTo(started, NOW + 30_000),
      NOW + 90_000,
    )
    const direct = advanceTo(started, NOW + 90_000)

    expect(segmented).toEqual(direct)
  })

  it('不会修改传入状态', () => {
    const started = requireSuccessfulStart()
    const snapshot = JSON.stringify(started)

    advanceTo(started, NOW + 45_000)

    expect(JSON.stringify(started)).toBe(snapshot)
    expect(started.activeExpedition?.processedEventCount).toBe(0)
  })

  it('相同状态、种子和目标时间得到相同结果', () => {
    const first = advanceTo(requireSuccessfulStart(), NOW + 75_000)
    const second = advanceTo(requireSuccessfulStart(), NOW + 75_000)

    expect(first).toEqual(second)
  })

  it('时钟回拨不改变状态，没有远征时仍推进时间', () => {
    const state = createNewGame(NOW)

    expect(advanceTo(state, NOW - 1)).toBe(state)
    const advanced = advanceTo(state, NOW + 1_000)
    expect(advanced.lastAdvancedAt).toBe(NOW + 1_000)
    expect(advanced.resources).toEqual(state.resources)
  })

  it('按瞭望塔等级限制离线推进，并消费被忽略的墙钟时间', () => {
    const started = requireSuccessfulStart()
    const expedition = started.activeExpedition
    if (expedition === null) {
      throw new Error('测试远征创建失败。')
    }
    const distantEventState: GameState = {
      ...started,
      activeExpedition: {
        ...expedition,
        nextEventAt: NOW + 9 * HOUR_MS,
      },
    }

    const capped = advanceTo(distantEventState, NOW + 12 * HOUR_MS)

    expect(capped.activeExpedition?.processedEventCount).toBe(0)
    expect(capped.activeExpedition?.nextEventAt).toBe(NOW + 13 * HOUR_MS)
    expect(capped.lastAdvancedAt).toBe(NOW + 12 * HOUR_MS)
    expect(getOfflineCapHours(0)).toBe(8)
    expect(getOfflineCapHours(3)).toBe(11)
    expect(getOfflineCapHours(99)).toBe(11)
  })
})

describe('expedition settlement', () => {
  it('返程时入库战利品、恢复英雄并保证首趟至少十份木材', () => {
    const completed = advanceTo(requireSuccessfulStart(), NOW + 90_000)

    expect(completed.resources.wood).toBeGreaterThanOrEqual(10)
    expect(completed.heroes.every((hero) => hero.status === 'idle')).toBe(true)
    expect(completed.activeExpedition).toBeNull()
    expect(completed.completedExpeditions).toBe(1)
    expect(completed.hasClaimedFirstExpeditionReward).toBe(true)
    expect(
      completed.journal.some((entry) => entry.title === '首次远征补给'),
    ).toBe(true)
    expect(
      completed.journal.some((entry) => entry.category === 'return'),
    ).toBe(true)
  })

  it('手动撤退结算已携带物资并保留剩余生命', () => {
    const started = requireSuccessfulStart({
      ...createNewGame(NOW),
      completedExpeditions: 1,
    })
    const expedition = started.activeExpedition
    if (expedition === null) {
      throw new Error('测试远征创建失败。')
    }
    const carrying: GameState = {
      ...started,
      heroes: started.heroes.map((hero) =>
        hero.id === 'ron' ? { ...hero, health: 7 } : hero,
      ),
      activeExpedition: {
        ...expedition,
        carriedLoot: { wood: 3, coins: 4, food: 1, medicine: 2 },
      },
    }
    const result = retreatExpedition(carrying, NOW)
    if (!result.ok) {
      throw new Error(result.error)
    }

    expect(result.state.resources).toEqual({
      wood: 3,
      coins: 24,
      food: 11,
      medicine: 6,
    })
    expect(result.state.heroes.find((hero) => hero.id === 'ron')?.health).toBe(7)
    expect(result.state.heroes.every((hero) => hero.status === 'idle')).toBe(true)
    expect(result.state.completedExpeditions).toBe(2)
  })

  it('首次手动撤退不发放完成补给，之后自然完成仍可领取', () => {
    const firstStart = requireSuccessfulStart()
    const retreated = retreatExpedition(firstStart, NOW)
    if (!retreated.ok) {
      throw new Error(retreated.error)
    }

    expect(retreated.state.resources.wood).toBe(0)
    expect(retreated.state.hasClaimedFirstExpeditionReward).toBe(false)
    expect(
      retreated.state.journal.some(
        (entry) => entry.title === '首次远征补给',
      ),
    ).toBe(false)

    const secondStart = requireSuccessfulStart(retreated.state)
    const completed = advanceTo(secondStart, NOW + 90_000)

    expect(completed.resources.wood).toBeGreaterThanOrEqual(10)
    expect(completed.hasClaimedFirstExpeditionReward).toBe(true)
    expect(
      completed.journal.some((entry) => entry.title === '首次远征补给'),
    ).toBe(true)
  })

  it('首次谨慎返程仍保证十份木材的可玩闭环', () => {
    const started = requireSuccessfulStart(createNewGame(NOW), {
      heroIds: ['eve', 'mia'],
      regionId: 'black-fir-forest',
      policy: 'cautious',
      seed: 1_751_876,
    })
    const returned = advanceTo(started, NOW + 90_000)

    expect(returned.activeExpedition).toBeNull()
    expect(returned.resources.wood).toBeGreaterThanOrEqual(10)
    expect(returned.hasClaimedFirstExpeditionReward).toBe(true)
    expect(
      returned.journal.some((entry) => entry.title === '首次远征补给'),
    ).toBe(true)
  })
})

describe('upgradeWatchtower', () => {
  it('木材足够时扣除费用、升级并提高离线结算上限', () => {
    const state = createNewGame(NOW)
    const result = upgradeWatchtower(
      { ...state, resources: { ...state.resources, wood: 10 } },
      NOW,
    )
    if (!result.ok) {
      throw new Error(result.error)
    }

    expect(result.state.station.watchtowerLevel).toBe(1)
    expect(result.state.resources.wood).toBe(0)
    expect(getOfflineCapHours(result.state)).toBe(9)
    expect(result.state.updatedAt).toBe(NOW)
  })

  it('木材不足或达到最高等级时拒绝升级', () => {
    const state = createNewGame(NOW)
    const poor = upgradeWatchtower(state, NOW)
    const maxed = upgradeWatchtower(
      { ...state, station: { watchtowerLevel: 3 }, resources: { ...state.resources, wood: 100 } },
      NOW,
    )

    expect(poor.ok ? '' : poor.error).toContain('木材不足')
    expect(maxed.ok ? '' : maxed.error).toContain('最高等级')
  })
})
