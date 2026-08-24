import { test, expect, openFreshGame, selectDefaultParty } from './testHarness.js'

test.beforeEach(async ({ page }) => {
  await openFreshGame(page)
})

test('进行中的远征刷新后继续且不会重复处理事件', async ({ page }) => {
  await selectDefaultParty(page)
  await page.getByRole('button', { name: '派遣远征' }).click()
  await page.getByRole('button', { name: '推进 15 秒' }).click()

  const activeExpedition = page.getByRole('region', { name: '黑杉林小队' })
  await expect(activeExpedition).toContainText('罗恩 · 伊芙')
  await expect(activeExpedition).toContainText('行动方针：探索')
  const progress = page.getByRole('progressbar')
  await expect(progress).toHaveAttribute('aria-valuenow', '1')
  const journalEntriesBeforeReload = await page.getByRole('article').count()

  await page.reload()
  await expect(activeExpedition).toContainText('罗恩 · 伊芙')
  await expect(activeExpedition).toContainText('行动方针：探索')
  await expect(progress).toHaveAttribute('aria-valuenow', '1')
  expect(await page.getByRole('article').count()).toBe(journalEntriesBeforeReload)

  await page.getByRole('button', { name: '推进 90 秒' }).click()
  await expect(page.getByRole('region', { name: '编组探索队' })).toBeVisible()
  await expect(page.getByText('本地单机存档 · 第 2 次远征准备')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: '远征归来' })).toHaveCount(1)

  const expeditionEventHeadings = page
    .getByRole('heading', { level: 3 })
    .filter({
      hasText: /^(平静行进|发现木材|发现旧钱币|遭遇迷雾狼|发现草药|迷路受伤)$/,
    })
  await expect(expeditionEventHeadings).toHaveCount(6)
  const completedJournalCount = await page.getByRole('article').count()
  expect(completedJournalCount).toBe(journalEntriesBeforeReload + 8)

  await page.getByRole('button', { name: '推进 90 秒' }).click()
  await expect(page.getByRole('heading', { level: 3, name: '远征归来' })).toHaveCount(1)
  expect(await page.getByRole('article').count()).toBe(completedJournalCount)
})
