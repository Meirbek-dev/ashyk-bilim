import { describe, expect, it } from 'vite-plus/test'
import kk from '@/messages/kk-KZ.json'

describe('UX-077 one kk term for teacher analytics', () => {
  it('uses «Мұғалім» (never «Оқытушы») for teacher analytics across the sidebar and the page header', () => {
    expect(JSON.stringify(kk)).not.toContain('Оқытушы аналитикас')
    expect(kk.SidebarMenu.ariaLabels.manageAnalytics).toContain('Мұғалім аналитикас')
    expect(kk.TeacherAnalytics.pages.shellTitle).toContain('Мұғалім аналитикас')
  })
})
