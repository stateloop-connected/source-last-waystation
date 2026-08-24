import { readFile } from 'node:fs/promises'
import { expect, test } from './testHarness.js'

const SAVE_STORAGE_KEY = 'last-waystation.save.v1'
const FIXED_NOW = 1_700_000_000_000

test('V1 活跃远征自动迁移为 V2 且刷新不会重复结算', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(FIXED_NOW)
  await page.goto('/')
  await page.evaluate((key) => {
    window.localStorage.clear()
    const now = Date.now()
    const expeditionId = 'expedition-v1-migration-fixture'
    const saveV1 = {
      schemaVersion: 1,
      savedAt: now,
      game: {
        gameVersion: '1.0.0',
        createdAt: now - 60_000,
        updatedAt: now,
        lastAdvancedAt: now,
        resources: { food: 7, medicine: 3, wood: 17, coins: 29 },
        heroes: [
          {
            id: 'ron',
            name: '罗恩',
            role: 'vanguard',
            level: 1,
            maxHealth: 120,
            health: 73,
            power: 9,
            insight: 4,
            survival: 5,
            status: 'expedition',
          },
          {
            id: 'eve',
            name: '伊芙',
            role: 'scout',
            level: 1,
            maxHealth: 90,
            health: 81,
            power: 4,
            insight: 9,
            survival: 8,
            status: 'expedition',
          },
          {
            id: 'mia',
            name: '米娅',
            role: 'medic',
            level: 1,
            maxHealth: 100,
            health: 66,
            power: 3,
            insight: 7,
            survival: 9,
            status: 'injured',
          },
        ],
        station: { watchtowerLevel: 2 },
        activeExpedition: {
          id: expeditionId,
          regionId: 'black-fir-forest',
          partyHeroIds: ['ron', 'eve'],
          policy: 'explore',
          seed: 123_456_789,
          rngState: 987_654_321,
          startedAt: now - 15_000,
          lastProcessedAt: now,
          nextEventAt: now + 15_000,
          processedEventCount: 1,
          maxEventCount: 6,
          carriedLoot: { wood: 4, coins: 3, food: 0, medicine: 1 },
          status: 'active',
        },
        completedExpeditions: 2,
        hasClaimedFirstExpeditionReward: true,
        journal: [
          {
            id: 'v1-system-entry',
            timestamp: now - 60_000,
            category: 'system',
            title: '合成 V1 存档',
            text: '这是一份用于迁移测试的合成存档。',
          },
          {
            id: `${expeditionId}-departure`,
            timestamp: now - 15_000,
            expeditionId,
            category: 'travel',
            title: '远征出发',
            text: '两名冒险者前往黑杉林，行动方针为探索。',
          },
          {
            id: `${expeditionId}-event-1`,
            timestamp: now,
            expeditionId,
            category: 'event',
            title: '发现木材',
            text: '倒伏的黑杉仍有不少干燥木料可以利用。',
          },
        ],
      },
    }

    window.localStorage.setItem(key, JSON.stringify(saveV1))
  }, SAVE_STORAGE_KEY)

  await page.reload()
  await expect(page.getByRole('link', { name: '最后驿站首页' })).toBeVisible()
  await expect(page.getByRole('region', { name: '驿站资源' })).toContainText(
    /木材\s*17/,
  )
  await expect(page.getByRole('region', { name: '黑杉林小队' })).toContainText('罗恩 · 伊芙')
  await expect(page.getByRole('heading', { level: 3, name: '合成 V1 存档' })).toBeVisible()

  const migratedJson = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_STORAGE_KEY)
  expect(migratedJson).not.toBeNull()
  const migrated: unknown = JSON.parse(migratedJson ?? 'null')
  expect(migrated).toMatchObject({
    schemaVersion: 2,
    game: {
      unlockedRegionIds: ['black-fir-forest'],
      resources: { food: 7, medicine: 3, wood: 17, coins: 29 },
      station: { watchtowerLevel: 2, infirmaryLevel: 0 },
      heroes: [
        { id: 'ron', health: 73, traitIds: ['ronn.guardian'] },
        { id: 'eve', health: 81, traitIds: ['eve.pathfinder'] },
        { id: 'mia', health: 66, traitIds: ['mia.field-medic'] },
      ],
      activeExpedition: {
        id: 'expedition-v1-migration-fixture',
        rngState: 987_654_321,
        processedEventCount: 1,
        carriedLoot: { wood: 4, coins: 3, food: 0, medicine: 1 },
        eventFlags: [],
      },
      completedExpeditions: 2,
      hasClaimedFirstExpeditionReward: true,
      journal: expect.arrayContaining([
        expect.objectContaining({ id: 'v1-system-entry', title: '合成 V1 存档' }),
      ]),
    },
  })
  const migratedExpedition = (
    migrated as {
      game: {
        activeExpedition: {
          nextEventAt: number
          lastProcessedAt: number
        }
      }
    }
  ).game.activeExpedition
  expect(
    migratedExpedition.nextEventAt - migratedExpedition.lastProcessedAt,
  ).toBe(15_000)

  const journalCount = await page.getByRole('article').count()
  await page.reload()
  await expect(page.getByRole('region', { name: '黑杉林小队' })).toBeVisible()
  expect(await page.getByRole('article').count()).toBe(journalCount)

  const migratedAgainJson = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_STORAGE_KEY)
  const migratedAgain: unknown = JSON.parse(migratedAgainJson ?? 'null')
  expect(migratedAgain).toMatchObject({
    schemaVersion: 2,
    game: {
      resources: { food: 7, medicine: 3, wood: 17, coins: 29 },
      heroes: [
        { id: 'ron', health: 73 },
        { id: 'eve', health: 81 },
        { id: 'mia', health: 66 },
      ],
      activeExpedition: {
        rngState: 987_654_321,
        processedEventCount: 1,
      },
      completedExpeditions: 2,
    },
  })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出' }).click()
  const download = await downloadPromise
  const exportPath = testInfo.outputPath('migrated-v2-save.json')
  await download.saveAs(exportPath)
  const exported: unknown = JSON.parse(await readFile(exportPath, 'utf8'))
  expect(exported).toMatchObject({ schemaVersion: 2 })
})
