import { Buffer } from 'node:buffer'
import {
  createFreshV2Save,
  E2E_MOTION_STORAGE_KEY,
  expect,
  openFreshGame,
  selectDefaultParty,
  test,
} from './testHarness.js'

test('关闭动画时保留静态场景和即时状态，刷新与导入不覆盖偏好', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openFreshGame(page)

  await page.getByRole('radio', { name: '关闭' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await expect(page.locator('html')).toHaveAttribute(
    'data-motion-preference',
    'off',
  )
  await expect(page.locator('.motion-root')).toHaveAttribute(
    'data-motion',
    'off',
  )

  await selectDefaultParty(page)
  await page.getByRole('button', { name: '派遣远征' }).click()
  const scene = page.getByTestId('expedition-scene')
  await expect(scene).toBeVisible()
  await expect(scene.locator('.black-fir-backdrop__art')).toBeVisible()
  const progress = page.getByRole('progressbar')
  await expect(progress).toHaveAttribute('aria-valuenow', '0')

  await page.getByRole('button', { name: '推进 15 秒' }).click()
  await expect(progress).toHaveAttribute('aria-valuenow', '1')
  await expect(page.getByTestId('expedition-event-overlay')).toBeVisible()

  const motionState = await scene.evaluate((element) => {
    const party = element.querySelector('.expedition-route__party')
    const eventCard = element.querySelector('.event-card')
    if (party === null || eventCard === null) {
      throw new Error('远征场景缺少路线或事件卡。')
    }

    return {
      animationCount: element.getAnimations({ subtree: true }).length,
      eventAnimationName: window.getComputedStyle(eventCard).animationName,
      partyTransitionDuration:
        window.getComputedStyle(party).transitionDuration,
    }
  })
  expect(motionState.animationCount).toBe(0)
  expect(motionState.eventAnimationName).toBe('none')
  expect(Number.parseFloat(motionState.partyTransitionDuration)).toBeLessThanOrEqual(
    0.000_01,
  )

  await page.reload()
  await expect(page.getByRole('radio', { name: '关闭' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await expect(page.getByTestId('expedition-scene')).toBeVisible()

  const importNow = await page.evaluate(() => Date.now())
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'motion-preference-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createFreshV2Save(importNow))),
  })

  await expect(page.getByText('存档导入成功', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await expect(page.getByRole('radio', { name: '关闭' })).toBeChecked()
  await expect(page.getByTestId('expedition-event-overlay')).toHaveCount(0)
  const storedPreference = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    E2E_MOTION_STORAGE_KEY,
  )
  expect(storedPreference).toBe(JSON.stringify({ motion: 'off' }))

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '重置' }).click()
  await expect(page.getByText('新游戏已创建', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      E2E_MOTION_STORAGE_KEY,
    ),
  ).toBe(JSON.stringify({ motion: 'off' }))
})

test('跟随系统在 prefers-reduced-motion 下解析为简化模式', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFreshGame(page)

  await expect(page.getByRole('radio', { name: '跟随系统' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute(
    'data-motion-preference',
    'system',
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-motion',
    'reduced',
  )
  expect(
    await page.evaluate(() =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true)

  await selectDefaultParty(page)
  await page.getByRole('button', { name: '派遣远征' }).click()
  const scene = page.getByTestId('expedition-scene')
  await expect(scene).toBeVisible()
  const environmentAnimations = await scene.evaluate((element) =>
    [...element.getAnimations({ subtree: true })].filter((animation) =>
      animation.effect instanceof KeyframeEffect &&
      animation.effect.target?.closest('.black-fir-backdrop') !== null,
    ).length,
  )
  expect(environmentAnimations).toBe(0)
  const routeTransitionDuration = await scene
    .locator('.expedition-route__party')
    .evaluate((element) => window.getComputedStyle(element).transitionDuration)
  expect(Number.parseFloat(routeTransitionDuration)).toBeLessThanOrEqual(
    0.000_01,
  )
})
