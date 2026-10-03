import { afterEach, describe, expect, test } from 'vite-plus/test'

import appCss from './globals.css?url'
import proseCss from './prose.css?url'

const sheet = (href: string) =>
  new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href })
    link.addEventListener('load', resolve)
    link.addEventListener('error', reject)
    document.head.append(link)
  })

const CONTENT = `
  <h1>A</h1><h2>B</h2><h3>C</h3><p>Text <code>x</code> <a href="#a">link</a></p>
  <ul><li>one</li></ul><pre><code>y</code></pre>
  <table><tbody><tr><th>h</th><td>d</td></tr></tbody></table>
  <div data-callout="warning"><p>careful</p></div>`

async function renderProse(density?: 'compact') {
  await Promise.all([sheet(appCss), sheet(proseCss)])
  const region = document.createElement('div')
  if (density) region.dataset['density'] = density
  region.innerHTML = `<article class="ab-prose max-w-none">${CONTENT}</article>`
  document.body.append(region)
  const style = (selector: string) => getComputedStyle(region.querySelector(selector) ?? region)
  return style
}

afterEach(() => document.body.replaceChildren())

describe('prose (styles/prose.css)', () => {
  test('headings follow the DESIGN 4 scale; code is mono on muted; a utility still overrides the width', async () => {
    const style = await renderProse()
    expect(style('h1').fontSize).toBe('28px')
    expect(style('h2').fontSize).toBe('22px')
    expect(style('h3').fontSize).toBe('18px')
    expect(style('h1').fontWeight).toBe('600')
    expect(style('p').fontSize).toBe('16px')
    expect(style('p code').fontFamily).toContain('Geist Mono')
    expect(style('pre').fontFamily).toContain('Geist Mono')
    expect(style('ul').listStyleType).toBe('disc')
    expect(style('a').textDecorationLine).toBe('underline')
    expect(style('table').overflowX).toBe('auto')
    expect(style('[data-callout]').borderTopWidth).toBe('1px')
    expect(style('[data-callout]').backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(style('article').maxWidth).toBe('none')
  })

  test('compact density shrinks text and headings one step', async () => {
    const style = await renderProse('compact')
    expect(style('p').fontSize).toBe('14px')
    expect(style('h1').fontSize).toBe('22px')
    expect(style('h3').fontSize).toBe('16px')
  })
})
