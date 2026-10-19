import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { TimeSeries } from './time-series'

const title = 'Submissions'
const format = (value: number) => String(value)
const zeros = [
  { label: '1 Oct', value: 0 },
  { label: '2 Oct', value: 0 },
]

test('a series of zeros says so in one line instead of a flat chart', async () => {
  const screen = await renderInRouter(<TimeSeries title={title} data={zeros} formatValue={format} />)
  await expect.element(screen.getByText(m.ui_chart_all_zero())).toBeVisible()
  expect(screen.getByRole('table', { includeHidden: true }).elements()).toHaveLength(0)
})

test('a series with a value keeps the chart and its table of values', async () => {
  const data = [...zeros, { label: '3 Oct', value: 2 }]
  const screen = await renderInRouter(<TimeSeries title={title} data={data} formatValue={format} />)
  await expect.element(screen.getByRole('table', { includeHidden: true })).toBeInTheDocument()
  expect(screen.getByText(m.ui_chart_all_zero()).elements()).toHaveLength(0)
})
