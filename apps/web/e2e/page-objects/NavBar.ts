import type { Page, Locator } from '@playwright/test'

/**
 * Shared navigation chrome — sidebar/topbar present on all authenticated pages.
 */
export class NavBar {
  public readonly page: Page

  /** Link / button that navigates to the teacher dashboard */
  public readonly dashboardLink: Locator
  /** User avatar / profile menu trigger */
  public readonly userMenu: Locator
  /** Logout button inside the user menu */
  public readonly logoutButton: Locator

  public constructor(page: Page) {
    this.page = page
    // The sidebar "dashboard" link — resilient to label text changes
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i }).first()
    // Avatar button in the top-right corner
    this.userMenu = page
      .locator('button[aria-label*="user"], button[aria-label*="profile"], header button')
      .last()
    this.logoutButton = page.getByRole('menuitem', {
      name: /log\s*out|sign\s*out/i,
    })
  }

  public async logout(): Promise<void> {
    await this.userMenu.click()
    await this.logoutButton.click()
    await this.page.waitForURL(url => url.pathname.includes('/login') || url.pathname === '/')
  }
}
