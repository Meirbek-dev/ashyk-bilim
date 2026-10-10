import { render } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import CoursePlaceholder from '@components/Objects/Thumbnails/CoursePlaceholder'

describe('generated course cover', () => {
  it('uses a stable, muted palette without gradients', () => {
    const colors = new Set<string>()
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { container, rerender } = render(<CoursePlaceholder seed={seed} title="Data analysis" />)
      const cover = container.firstElementChild as HTMLElement
      const color = cover.style.backgroundColor
      colors.add(color)
      expect(cover.style.backgroundImage).toBe('')
      expect(cover.style.color).toBe('rgb(51, 65, 85)')
      rerender(<CoursePlaceholder seed={seed} title="Changed title" compact />)
      expect(cover.style.backgroundColor).toBe(color)
    }
    expect(colors).toEqual(
      new Set([
        'rgb(226, 232, 238)',
        'rgb(226, 233, 225)',
        'rgb(238, 230, 218)',
        'rgb(232, 227, 237)',
        'rgb(221, 233, 236)',
      ]),
    )
  })

  it.each([
    ['Интеллектуальный анализ данных', 'ИАД'],
    ['Технологии погружения и виртуальной реальности', 'ТПИВР'],
    ['Толықтырылған және виртуалды шынайылық технологиялары', 'ТЖВШТ'],
    ['  data\tanalysis\n basics  ', 'DAB'],
    ['HTML және CSS-те веб-программалау / Веб-программирование', 'HЖCТВПВП'],
    ['C# в Unity 3D', 'CВU3'],
    [' — / ', ''],
  ])('uses word initials for %s', (title, abbreviation) => {
    const { container } = render(<CoursePlaceholder seed="course-id" title={title} />)
    expect(container.textContent).toBe(abbreviation)
  })

  it('fits the entire abbreviation in a compact cover', () => {
    const { container } = render(
      <CoursePlaceholder seed="course-id" title="Технологии погружения и виртуальной реальности" compact />,
    )
    const text = container.querySelector('span')
    expect(text?.textContent).toBe('ТПИВР')
    expect(text?.style.fontSize).toBe('min(1.25rem, 20cqw)')
  })
})
