import { expect, test as base, type Page } from '@playwright/test'

type ClientErrorFixtures = {
  clientErrors: string[]
}

export const test = base.extend<ClientErrorFixtures>({
  clientErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(`console: ${message.text()}`)
        }
      })
      page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.message}`)
      })

      await use(errors)
      expect(errors, '浏览器不应产生 console error 或 pageerror').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function openFreshGame(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('link', { name: '最后驿站首页' })).toBeVisible()
}

export async function selectDefaultParty(page: Page): Promise<void> {
  const ron = page.getByRole('checkbox', { name: /罗恩/ })
  const eve = page.getByRole('checkbox', { name: /伊芙/ })
  const mia = page.getByRole('checkbox', { name: /米娅/ })

  await ron.press('Space')
  await eve.press('Space')

  await expect(ron).toBeChecked()
  await expect(eve).toBeChecked()
  await expect(mia).toBeDisabled()
}

export async function readResource(page: Page, label: string): Promise<number> {
  const resourceText = await page
    .getByRole('region', { name: '驿站资源' })
    .innerText()
  const match = new RegExp(`${label}\\s*(\\d+)`).exec(resourceText)
  expect(match, `应显示${label}数量`).not.toBeNull()
  return Number(match?.[1])
}

export const E2E_SAVE_STORAGE_KEY = 'last-waystation.save.v1'
export const E2E_MOTION_STORAGE_KEY =
  'last-waystation.ui-preferences.v1'

export type E2EStoredSave = {
  schemaVersion: number
  savedAt: number
  game: {
    lastAdvancedAt: number
    resources: { food: number; medicine: number; wood: number; coins: number }
    heroes: Array<{ id: string; health: number }>
    activeExpedition: null | {
      processedEventCount: number
      carriedLoot: { wood: number }
    }
    completedExpeditions: number
    journal: Array<{ id: string; sourceEventId?: string; title: string }>
  }
}

const HERO_FIXTURES = [
  ['ron', '罗恩', 'vanguard', 'ronn.guardian', 120, 9, 4, 5],
  ['eve', '伊芙', 'scout', 'eve.pathfinder', 90, 4, 9, 8],
  ['mia', '米娅', 'medic', 'mia.field-medic', 100, 3, 7, 9],
] as const

function createFixtureHeroes() {
  return HERO_FIXTURES.map(
    ([id, name, role, traitId, maxHealth, power, insight, survival]) => ({
      id,
      name,
      role,
      traitIds: [traitId],
      level: 1,
      maxHealth,
      health: maxHealth,
      power,
      insight,
      survival,
      status: 'idle' as const,
    }),
  )
}

export function createFreshV2Save(now: number) {
  return {
    schemaVersion: 2,
    savedAt: now,
    game: {
      gameVersion: '1.0.0',
      createdAt: now,
      updatedAt: now,
      lastAdvancedAt: now,
      resources: { food: 12, medicine: 4, wood: 0, coins: 20 },
      unlockedRegionIds: ['black-fir-forest'],
      heroes: createFixtureHeroes(),
      station: { watchtowerLevel: 0, infirmaryLevel: 0 },
      activeExpedition: null,
      completedExpeditions: 0,
      hasClaimedFirstExpeditionReward: false,
      journal: [
        {
          id: `system-new-game-${now}`,
          timestamp: now,
          category: 'system',
          title: '接管边境站',
          text: '炉火重新燃起。先组织一支两人远征队，前往黑杉林寻找补给。',
        },
      ],
    },
  }
}

export function createActiveV2Save(
  now: number,
  seed: number,
) {
  const save = createFreshV2Save(now)
  const expeditionId = `expedition-${now}-1`

  return {
    ...save,
    game: {
      ...save.game,
      resources: { ...save.game.resources, food: 10 },
      heroes: save.game.heroes.map((hero) =>
        hero.id === 'ron' || hero.id === 'eve'
          ? { ...hero, status: 'expedition' }
          : hero,
      ),
      activeExpedition: {
        id: expeditionId,
        regionId: 'black-fir-forest',
        partyHeroIds: ['ron', 'eve'],
        policy: 'explore',
        seed,
        rngState: seed,
        startedAt: now,
        lastProcessedAt: now,
        nextEventAt: now + 15_000,
        processedEventCount: 0,
        maxEventCount: 6,
        carriedLoot: { food: 0, medicine: 0, wood: 0, coins: 0 },
        eventFlags: [],
        status: 'active',
      },
      journal: [
        ...save.game.journal,
        {
          id: `${expeditionId}-departure`,
          timestamp: now,
          expeditionId,
          category: 'travel',
          title: '远征出发',
          text: '两名冒险者前往黑杉林，行动方针为探索。',
        },
      ],
    },
  }
}

export async function installV2Save(
  page: Page,
  save:
    | ReturnType<typeof createFreshV2Save>
    | ReturnType<typeof createActiveV2Save>,
  motion?: 'system' | 'full' | 'reduced' | 'off',
): Promise<void> {
  await page.goto('/')
  await page.evaluate(
    ({ motionKey, motionPreference, saveKey, saveFile }) => {
      window.localStorage.clear()
      window.localStorage.setItem(saveKey, JSON.stringify(saveFile))
      if (motionPreference !== undefined) {
        window.localStorage.setItem(
          motionKey,
          JSON.stringify({ motion: motionPreference }),
        )
      }
    },
    {
      motionKey: E2E_MOTION_STORAGE_KEY,
      motionPreference: motion,
      saveKey: E2E_SAVE_STORAGE_KEY,
      saveFile: save,
    },
  )
  await page.reload()
  await expect(page.getByRole('link', { name: '最后驿站首页' })).toBeVisible()
}

export async function readStoredV2Save(page: Page): Promise<E2EStoredSave> {
  const stored = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    E2E_SAVE_STORAGE_KEY,
  )
  if (stored === null) {
    throw new Error('预期浏览器中存在 V2 存档。')
  }

  const parsed: unknown = JSON.parse(stored)
  expect(parsed).toMatchObject({ schemaVersion: 2 })
  return parsed as E2EStoredSave
}
