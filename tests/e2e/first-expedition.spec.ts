import { test, expect, openFreshGame, readResource, selectDefaultParty } from './testHarness.js'

test.beforeEach(async ({ page }) => {
  await openFreshGame(page)
})

test('完成首次远征、升级瞭望塔并在刷新后保留进度', async ({ page }) => {
  expect(await readResource(page, '食物')).toBe(12)
  expect(await readResource(page, '药品')).toBe(4)
  expect(await readResource(page, '木材')).toBe(0)
  expect(await readResource(page, '金币')).toBe(20)

  await selectDefaultParty(page)
  await page.getByRole('radio', { name: /探索/ }).check()
  await page.getByRole('button', { name: '派遣远征' }).click()

  const activeExpedition = page.getByRole('region', { name: '黑杉林小队' })
  await expect(activeExpedition).toContainText('罗恩 · 伊芙')
  await expect(activeExpedition).toContainText('行动方针：探索')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  expect(await readResource(page, '食物')).toBe(10)

  await page.getByRole('button', { name: '推进 90 秒' }).click()

  const journal = page.getByRole('region', { name: '冒险日志' })
  await expect(page.getByRole('region', { name: '编组探索队' })).toBeVisible()
  await expect(journal).toContainText('远征归来')
  await expect(journal).toContainText('首次远征补给')
  const woodBeforeUpgrade = await readResource(page, '木材')
  expect(woodBeforeUpgrade).toBeGreaterThanOrEqual(10)
  expect(await page.getByRole('article').count()).toBeGreaterThan(5)

  await page.getByRole('button', { name: '升级' }).click()
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()
  await expect(page.getByRole('region', { name: '瞭望塔' })).toContainText('9 小时')
  const persistedResources = {
    food: await readResource(page, '食物'),
    medicine: await readResource(page, '药品'),
    wood: await readResource(page, '木材'),
    coins: await readResource(page, '金币'),
  }
  expect(persistedResources.wood).toBe(woodBeforeUpgrade - 10)
  const persistedJournalCount = await page.getByRole('article').count()

  await page.reload()
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()
  await expect(page.getByRole('region', { name: '瞭望塔' })).toContainText('9 小时')
  expect(await readResource(page, '食物')).toBe(persistedResources.food)
  expect(await readResource(page, '药品')).toBe(persistedResources.medicine)
  expect(await readResource(page, '木材')).toBe(persistedResources.wood)
  expect(await readResource(page, '金币')).toBe(persistedResources.coins)
  expect(await page.getByRole('article').count()).toBe(persistedJournalCount)
  await expect(journal).toContainText('瞭望塔升级')
})
