import { expect, testAsAdmin, testAsStudent, testAsTeacher } from '../fixtures'

testAsStudent.describe('Dashboard work queue - learner', () => {
  testAsStudent('shows learner queue and secondary tools', async ({ page }) => {
    await page.goto('/en/dash')

    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByTestId('dashboard-work-queue')).toBeVisible()
    await expect(page.getByTestId('work-queue-learner')).toBeVisible()
    await expect(page.getByTestId('work-queue-empty-learner')).toBeVisible()
    await expect(page.getByTestId('dashboard-tools')).toBeVisible()
  })
})

testAsTeacher.describe('Dashboard work queue - teacher', () => {
  testAsTeacher('shows teacher queue without admin queue', async ({ page }) => {
    await page.goto('/en/dash')

    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByTestId('work-queue-teacher')).toBeVisible()
    await expect(page.getByTestId('dashboard-tools')).toBeVisible()
    await expect(page.getByTestId('work-queue-admin')).toHaveCount(0)
  })
})

testAsAdmin.describe('Dashboard work queue - admin', () => {
  testAsAdmin('shows admin queue and platform tools', async ({ page }) => {
    await page.goto('/en/dash')

    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByTestId('work-queue-admin')).toBeVisible()
    await expect(page.getByTestId('dashboard-tools')).toBeVisible()
    await expect(page.getByRole('link', { name: /open/i }).first()).toBeVisible()
  })
})
