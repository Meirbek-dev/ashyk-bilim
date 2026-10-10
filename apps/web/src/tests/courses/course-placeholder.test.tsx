import { render } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import CoursePlaceholder from '@components/Objects/Thumbnails/CoursePlaceholder'

describe('generated course cover', () => {
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
