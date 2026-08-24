import { test, expect, openFreshGame, readResource } from './testHarness.js'

const SAVE_STORAGE_KEY = 'last-waystation.save.v1'

test.beforeEach(async ({ page }) => {
  await openFreshGame(page)
})

test('导出导入、损坏文件和重置确认均保护当前存档', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '补充 20 木材' }).click()
  await page.getByRole('button', { name: '升级' }).click()
  expect(await readResource(page, '木材')).toBe(10)
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^last-waystation-save-\d{4}-\d{2}-\d{2}\.json$/)
  const savePath = testInfo.outputPath('exported-save.json')
  await download.saveAs(savePath)

  await page.getByRole('button', { name: '补充 20 木材' }).click()
  expect(await readResource(page, '木材')).toBe(30)

  let chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入' }).click()
  let chooser = await chooserPromise
  await chooser.setFiles(savePath)
  await expect(page.getByText('存档导入成功', { exact: true })).toBeVisible()
  expect(await readResource(page, '木材')).toBe(10)
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()

  chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入' }).click()
  chooser = await chooserPromise
  await chooser.setFiles({
    name: 'broken-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 1'),
  })
  await expect(page.getByText('存档不是有效的 JSON。', { exact: true })).toBeVisible()
  expect(await readResource(page, '木材')).toBe(10)
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()

  chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入' }).click()
  chooser = await chooserPromise
  await chooser.setFiles({
    name: 'missing-game.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, savedAt: Date.now() })),
  })
  await expect(
    page.getByText('存档内容结构无效或缺少关键字段。', { exact: true }),
  ).toBeVisible()
  expect(await readResource(page, '木材')).toBe(10)
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()

  await page.getByRole('button', { name: '补充 20 木材' }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '重置' }).click()
  expect(await readResource(page, '木材')).toBe(30)
  await expect(page.getByLabel('瞭望塔等级 1 / 3')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '重置' }).click()
  await expect(page.getByText('新游戏已创建', { exact: true })).toBeVisible()
  expect(await readResource(page, '木材')).toBe(0)
  await expect(page.getByLabel('瞭望塔等级 0 / 3')).toBeVisible()

  const quarantinedText = '{"schemaVersion":1,"broken":true}'
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SAVE_STORAGE_KEY, quarantinedText],
  )
  await page.reload()
  await expect(
    page.getByText('存档内容结构无效或缺少关键字段。', { exact: true }),
  ).toBeVisible()

  await page.waitForTimeout(5_500)
  await page.getByRole('button', { name: '补充 20 木材' }).click()
  const storedAfterAutoSave = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    SAVE_STORAGE_KEY,
  )
  expect(storedAfterAutoSave).toBe(quarantinedText)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '重置' }).click()
  await expect(page.getByText('新游戏已创建', { exact: true })).toBeVisible()
  const storedAfterReset = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    SAVE_STORAGE_KEY,
  )
  expect(JSON.parse(storedAfterReset ?? 'null')).toMatchObject({
    schemaVersion: 2,
  })
})
