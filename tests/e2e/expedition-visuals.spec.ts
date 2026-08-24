import type { Page } from '@playwright/test'
import {
  createActiveV2Save,
  expect,
  installV2Save,
  readResource,
  readStoredV2Save,
  test,
} from './testHarness.js'

const FIXED_NOW = 2_000_000_000_000

async function loadActiveGame(
  page: Page,
  save: ReturnType<typeof createActiveV2Save>,
): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.setFixedTime(FIXED_NOW)
  await installV2Save(page, save, 'full')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')
  await expect(
    page.getByRole('region', { name: '黑杉林远征场景' }),
  ).toBeVisible()
}

test('路线从 0 推进到 1，事件卡、奖励与日志使用同一结算结果', async ({
  page,
}) => {
  const save = createActiveV2Save(FIXED_NOW, 2_200)
  const expedition = save.game.activeExpedition
  if (expedition === null) {
    throw new Error('测试存档应包含进行中的远征。')
  }

  await loadActiveGame(page, save)

  const routeProgress = page.getByRole('progressbar')
  await expect(routeProgress).toHaveAttribute('aria-valuemax', '6')
  await expect(routeProgress).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByTestId('expedition-route-node')).toHaveCount(
    expedition.maxEventCount,
  )
  await expect(page.getByTestId('expedition-route-start')).toHaveAttribute(
    'data-current',
    'true',
  )

  await page.getByRole('button', { name: '推进 15 秒' }).click()

  await expect(routeProgress).toHaveAttribute('aria-valuenow', '1')
  const overlay = page.getByTestId('expedition-event-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveAttribute('data-event-id', 'fallen-timber')
  await expect(
    overlay.getByRole('heading', { name: '发现木材' }),
  ).toBeVisible()
  await expect(overlay.getByLabel('事件收获')).toContainText('+2 木材')

  const journal = page.getByRole('region', { name: '冒险日志' })
  await expect(
    journal.getByRole('heading', { level: 3, name: '发现木材' }),
  ).toHaveCount(1)
  await expect(journal).toContainText('获得 2 份木材')
  await expect(
    page.getByRole('region', { name: '黑杉林小队' }),
  ).toContainText('木材2')

  const stored = await readStoredV2Save(page)
  expect(stored.game.activeExpedition?.processedEventCount).toBe(1)
  expect(stored.game.activeExpedition?.carriedLoot.wood).toBe(2)
  expect(
    stored.game.journal.find((entry) => entry.id.endsWith('-event-1')),
  ).toMatchObject({ sourceEventId: 'fallen-timber', title: '发现木材' })
})

test('伤害反馈只关联实际受伤英雄，生命值与日志一致', async ({
  page,
}) => {
  await loadActiveGame(page, createActiveV2Save(FIXED_NOW, 9_728))
  await page.getByRole('button', { name: '推进 15 秒' }).click()

  const overlay = page.getByTestId('expedition-event-overlay')
  await expect(overlay).toHaveAttribute('data-event-id', 'mist-wolf')
  await expect(
    overlay.getByRole('heading', { name: '遭遇迷雾狼' }),
  ).toBeVisible()

  const eve = page.getByTestId('expedition-hero-eve')
  const ron = page.getByTestId('expedition-hero-ron')
  await expect(eve).toHaveAttribute('data-feedback', 'damage')
  await expect(eve).toHaveAttribute(
    'aria-label',
    '伊芙，斥候，生命 73 / 90',
  )
  await expect(eve).toContainText('-17')
  await expect(ron).toHaveAttribute('data-feedback', 'none')
  await expect(ron).toHaveAttribute(
    'aria-label',
    '罗恩，先锋，生命 120 / 120',
  )

  const journal = page.getByRole('region', { name: '冒险日志' })
  await expect(journal).toContainText('伊芙 失去 17 点生命')
  const stored = await readStoredV2Save(page)
  expect(stored.game.heroes.find((hero) => hero.id === 'eve')?.health).toBe(
    73,
  )
  expect(stored.game.heroes.find((hero) => hero.id === 'ron')?.health).toBe(
    120,
  )
})

test('90 秒批量推进只显示一份返程摘要，并立即保存且刷新不重放', async ({
  page,
}) => {
  await loadActiveGame(
    page,
    createActiveV2Save(FIXED_NOW, 20_260_824),
  )
  await page.getByRole('button', { name: '推进 90 秒' }).click()

  await expect(
    page.getByRole('region', { name: '编组探索队' }),
  ).toBeVisible()
  const returnSummary = page.getByTestId('return-summary')
  await expect(returnSummary).toHaveCount(1)
  await expect(returnSummary).toContainText('本次处理 6 个事件')
  await expect(page.getByTestId('progress-summary')).toHaveCount(0)
  await expect(page.getByTestId('offline-summary')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { level: 3, name: '远征归来' }),
  ).toHaveCount(1)

  const stored = await readStoredV2Save(page)
  expect(stored.game.activeExpedition).toBeNull()
  expect(stored.game.completedExpeditions).toBe(1)
  expect(stored.game.resources).toEqual({
    food: 10,
    medicine: 8,
    wood: 10,
    coins: 24,
  })
  expect(stored.game.journal).toHaveLength(11)
  expect(await readResource(page, '木材')).toBe(10)
  expect(await readResource(page, '金币')).toBe(24)

  await page.reload()
  await expect(page.getByTestId('return-summary')).toHaveCount(0)
  await expect(page.getByTestId('offline-summary')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { level: 3, name: '远征归来' }),
  ).toHaveCount(1)
  const reloaded = await readStoredV2Save(page)
  expect(reloaded.game.completedExpeditions).toBe(1)
  expect(reloaded.game.journal).toEqual(stored.game.journal)
})

test('返程后立即重新出发会清除上次事件与英雄反馈', async ({
  page,
}) => {
  await loadActiveGame(page, createActiveV2Save(FIXED_NOW, 9_728))
  await page.getByRole('button', { name: '推进 15 秒' }).click()
  await expect(page.getByTestId('expedition-event-overlay')).toBeVisible()
  await expect(page.getByTestId('expedition-hero-eve')).toHaveAttribute(
    'data-feedback',
    'damage',
  )

  await page.getByRole('button', { name: '手动撤退' }).click()
  await expect(page.getByTestId('return-summary')).toHaveCount(1)
  await page.getByRole('checkbox', { name: /罗恩/ }).press('Space')
  await page.getByRole('checkbox', { name: /米娅/ }).press('Space')
  await page.getByRole('button', { name: '派遣远征' }).click()

  await expect(page.getByTestId('return-summary')).toHaveCount(0)
  await expect(page.getByTestId('progress-summary')).toHaveCount(0)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '0',
  )
  await expect(page.getByTestId('expedition-hero-ron')).toHaveAttribute(
    'data-feedback',
    'none',
  )
  await expect(page.getByTestId('expedition-hero-mia')).toHaveAttribute(
    'data-feedback',
    'none',
  )
})

for (const viewport of [
  { width: 1_440, height: 900 },
  { width: 768, height: 1_024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
]) {
  test(`${viewport.width}px 场景不横溢且事件卡不遮挡撤退与动画控件`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await loadActiveGame(page, createActiveV2Save(FIXED_NOW, 2_200))
    await page.getByRole('button', { name: '推进 15 秒' }).click()

    const scene = page.getByTestId('expedition-scene')
    const overlay = page.getByTestId('expedition-event-overlay')
    const retreat = page.getByRole('button', { name: '手动撤退' })
    await expect(overlay).toBeVisible()

    const [sceneBox, overlayBox, retreatBox, documentMetrics] =
      await Promise.all([
        scene.boundingBox(),
        overlay.boundingBox(),
        retreat.boundingBox(),
        page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })),
      ])

    expect(sceneBox).not.toBeNull()
    expect(overlayBox).not.toBeNull()
    expect(retreatBox).not.toBeNull()
    expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(
      documentMetrics.clientWidth,
    )
    expect((sceneBox?.x ?? -1) + (sceneBox?.width ?? Infinity)).toBeLessThanOrEqual(
      viewport.width,
    )

    const overlapsRetreat =
      overlayBox !== null &&
      retreatBox !== null &&
      overlayBox.x < retreatBox.x + retreatBox.width &&
      overlayBox.x + overlayBox.width > retreatBox.x &&
      overlayBox.y < retreatBox.y + retreatBox.height &&
      overlayBox.y + overlayBox.height > retreatBox.y
    expect(overlapsRetreat).toBe(false)

    await retreat.click({ trial: true })
    await page.getByRole('radio', { name: '关闭' }).click({ trial: true })
  })
}
