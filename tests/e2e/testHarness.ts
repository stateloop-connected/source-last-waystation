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
