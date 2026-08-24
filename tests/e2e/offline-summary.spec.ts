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
const EXPEDITION_STARTED_AT = FIXED_NOW - 90_000

async function setDocumentVisibility(
  page: Page,
  visibilityState: 'hidden' | 'visible',
): Promise<void> {
  await page.evaluate((nextVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: nextVisibilityState,
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: nextVisibilityState === 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, visibilityState)
}

test('过去的合法 V2 远征由正式模拟结算，只呈现一份离线摘要', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(FIXED_NOW)
  await installV2Save(
    page,
    createActiveV2Save(EXPEDITION_STARTED_AT, 20_260_824),
  )

  const summary = page.getByTestId('offline-summary')
  await expect(summary).toHaveCount(1)
  await expect(summary).toContainText('离线进展')
  await expect(summary).toContainText('处理了 6 个事件')
  await expect(summary).toContainText('完成远征 1 次')
  await expect(page.getByTestId('progress-summary')).toHaveCount(0)
  await expect(page.getByTestId('return-summary')).toHaveCount(0)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '编组探索队' }),
  ).toBeVisible()

  const journal = page.getByRole('region', { name: '冒险日志' })
  await expect(journal.getByRole('article')).toHaveCount(11)
  const eventHeadings = journal
    .getByRole('heading', { level: 3 })
    .filter({ hasText: /^(平静行进|发现草药|发现旧钱币)$/ })
  await expect(eventHeadings).toHaveCount(6)
  await expect(
    journal.getByRole('heading', { level: 3, name: '远征归来' }),
  ).toHaveCount(1)
  await expect(
    journal.getByRole('heading', { level: 3, name: '首次远征补给' }),
  ).toHaveCount(1)
  await expect(
    journal.getByRole('heading', { level: 3, name: '战利品入库' }),
  ).toHaveCount(1)

  expect(await readResource(page, '木材')).toBe(10)
  expect(await readResource(page, '金币')).toBe(24)
  expect(await readResource(page, '药品')).toBe(8)

  await expect
    .poll(async () => (await readStoredV2Save(page)).game.lastAdvancedAt)
    .toBe(FIXED_NOW)
  const stored = await readStoredV2Save(page)
  expect(stored.savedAt).toBe(FIXED_NOW)
  expect(stored.game.activeExpedition).toBeNull()
  expect(stored.game.completedExpeditions).toBe(1)
  expect(stored.game.resources).toEqual({
    food: 10,
    medicine: 8,
    wood: 10,
    coins: 24,
  })
  const storedMainEvents = stored.game.journal.filter((entry) =>
    /-event-\d+$/.test(entry.id),
  )
  expect(storedMainEvents).toHaveLength(6)
  expect(
    storedMainEvents.every(
      (entry) =>
        typeof entry.sourceEventId === 'string' &&
        entry.sourceEventId.length > 0,
    ),
  ).toBe(true)

  await page.reload()
  await expect(page.getByTestId('offline-summary')).toHaveCount(0)
  await expect(page.getByTestId('progress-summary')).toHaveCount(0)
  await expect(page.getByTestId('return-summary')).toHaveCount(0)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  await expect(journal.getByRole('article')).toHaveCount(11)
  const reloaded = await readStoredV2Save(page)
  expect(reloaded.game.journal).toEqual(stored.game.journal)
  expect(reloaded.game.completedExpeditions).toBe(1)
})

test('页面恢复后首个 tick 将隐藏期间的首尾差聚合为一份后台摘要', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: FIXED_NOW })
  await page.clock.pauseAt(FIXED_NOW + 1_000)
  await installV2Save(
    page,
    createActiveV2Save(FIXED_NOW, 2_200),
  )
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '0',
  )

  await setDocumentVisibility(page, 'hidden')
  await expect(page.locator('.visual-effects-root')).toHaveAttribute(
    'data-page-visible',
    'false',
  )
  await expect(page.getByTestId('expedition-scene')).toHaveAttribute(
    'data-paused',
    'true',
  )

  await page.clock.setSystemTime(FIXED_NOW + 32_000)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '0',
  )
  await expect(page.getByTestId('offline-summary')).toHaveCount(0)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)

  await setDocumentVisibility(page, 'visible')
  await page.clock.runFor(1_000)

  await expect(page.locator('.visual-effects-root')).toHaveAttribute(
    'data-page-visible',
    'true',
  )
  const summary = page.getByTestId('offline-summary')
  await expect(summary).toHaveCount(1)
  await expect(summary).toHaveAttribute('data-summary-kind', 'background')
  await expect(summary).toContainText('后台进展')
  await expect(summary).toContainText('处理了 2 个事件')
  await expect(summary).toContainText('木材+2')
  await expect(summary).toContainText('罗恩生命-14')
  await expect(page.getByTestId('progress-summary')).toHaveCount(0)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '2',
  )
  await expect(page.getByTestId('expedition-hero-ron')).toHaveAttribute(
    'aria-label',
    '罗恩，先锋，生命 106 / 120',
  )

  const journal = page.getByRole('region', { name: '冒险日志' })
  await expect(
    journal.getByRole('heading', { level: 3, name: '发现木材' }),
  ).toHaveCount(1)
  await expect(
    journal.getByRole('heading', { level: 3, name: '遭遇迷雾狼' }),
  ).toHaveCount(1)

  await page.clock.runFor(1_000)
  await expect(page.getByTestId('offline-summary')).toHaveCount(1)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
})

test('页面恢复后立即撤退时压缩逐事件反馈并保留一次返程摘要', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: FIXED_NOW })
  await page.clock.pauseAt(FIXED_NOW + 1_000)
  await installV2Save(
    page,
    createActiveV2Save(FIXED_NOW, 2_200),
  )

  await setDocumentVisibility(page, 'hidden')
  await page.clock.runFor(16_000)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '1',
  )
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  await setDocumentVisibility(page, 'visible')
  await page.getByRole('button', { name: '手动撤退' }).click()

  const summary = page.getByTestId('return-summary')
  await expect(summary).toHaveCount(1)
  await expect(summary).toContainText('本次处理 1 个事件')
  await expect(summary).toContainText('木材+2')
  await expect(page.getByTestId('offline-summary')).toHaveCount(0)
  await expect(page.getByTestId('progress-summary')).toHaveCount(0)
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '编组探索队' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: '冒险日志' })
      .getByRole('heading', { level: 3, name: '发现木材' }),
  ).toHaveCount(1)
})
