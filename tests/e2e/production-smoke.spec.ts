import { test, expect, openFreshGame, selectDefaultParty } from './testHarness.js'

test('生产构建加载本地资源、可交互且不暴露开发工具', async ({ page }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL)
  const appOrigin = new URL(baseURL).origin
  const failedAssets: string[] = []
  page.on('response', (response) => {
    const resourceType = response.request().resourceType()
    const isStaticAsset = ['script', 'stylesheet', 'image', 'font'].includes(resourceType)
    if (
      new URL(response.url()).origin === appOrigin &&
      isStaticAsset &&
      response.status() >= 400
    ) {
      failedAssets.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === appOrigin) {
      failedAssets.push(`request failed: ${request.url()}`)
    }
  })

  await openFreshGame(page)

  await expect(page.getByRole('region', { name: '驿站资源' })).toBeVisible()
  await expect(page.getByRole('region', { name: '开发调试工具' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '推进 90 秒' })).toHaveCount(0)

  const regionImage = page.getByRole('img', {
    name: '雾气笼罩的黑杉林与边境瞭望塔',
  })
  await expect(regionImage).toBeVisible()
  expect(
    await regionImage.evaluate(
      (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
    ),
  ).toBe(true)

  await selectDefaultParty(page)
  await page.getByRole('button', { name: '派遣远征' }).click()
  await expect(page.getByRole('region', { name: '黑杉林小队' })).toBeVisible()

  await page.setViewportSize({ width: 360, height: 800 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入' }).click()
  const fileChooser = await fileChooserPromise
  expect(fileChooser.isMultiple()).toBe(false)
  await fileChooser.setFiles([])

  let resetDialogType = ''
  const resetDialogHandled = new Promise<void>((resolve, reject) => {
    page.once('dialog', (dialog) => {
      resetDialogType = dialog.type()
      void dialog.dismiss().then(resolve, reject)
    })
  })
  await page.getByRole('button', { name: '重置' }).click()
  await resetDialogHandled
  expect(resetDialogType).toBe('confirm')
  await expect(page.getByRole('region', { name: '黑杉林小队' })).toBeVisible()
  expect(failedAssets, '生产构建的同源 JS、CSS、图片和字体不应加载失败').toEqual([])
})
