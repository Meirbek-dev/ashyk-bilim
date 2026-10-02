import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Run through `just web check:messages` while migrating consumers to Paraglide.
for (const locale of ['ru-RU', 'kk-KZ', 'en-US']) {
  const catalog = JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), 'utf8'))
  assert.equal(catalog.$schema, 'https://inlang.com/schema/inlang-message-format')
  let count = 0
  function check(value, key) {
    if (typeof value === 'string') {
      assert.doesNotMatch(value, /\{[^{}]+,\s*(plural|select|selectordinal|number|date|time)\b|<\/?[a-zA-Z]/, key)
      return
    }
    assert.ok(Array.isArray(value) && value.length === 1, key)
    const [message] = value
    const declarations = message.declarations ?? []
    const names = declarations.map(declaration => declaration.match(/^(?:input|local) ([^\s=]+)/)?.[1])
    assert.ok(names.every(Boolean), key)
    assert.equal(new Set(names).size, names.length, key)
    const selectors = message.selectors ?? []
    assert.ok(
      selectors.every(selector => names.includes(selector)),
      key,
    )
    assert.ok(Object.keys(message.match).length > 0, key)
    assert.ok(
      Object.keys(message.match).some(condition => condition.split(',').every(part => part.trim().endsWith('=*'))),
      `${key}: missing fallback`,
    )
    for (const [condition, pattern] of Object.entries(message.match)) {
      assert.ok(
        condition.split(',').every(part => names.includes(part.trim().split('=')[0])),
        key,
      )
      check(pattern, key)
    }
  }
  function walk(object, prefix = '') {
    for (const [key, value] of Object.entries(object)) {
      if (key === '$schema') continue
      const id = prefix + key
      if (typeof value === 'object' && !Array.isArray(value)) {
        assert.ok(Object.keys(value).length > 0, `${id}: empty namespace`)
        walk(value, `${id}.`)
      } else {
        check(value, id)
        count++
      }
    }
  }
  walk(catalog)
  const points = catalog.Activities.ExamActivity.points[0]
  assert.ok(points.selectors.includes('count'))
  assert.ok(Object.keys(points.match).some(condition => condition.startsWith('count=0,')))
  assert.match(
    catalog.Components.CourseThumbnail.updatedDate[0].declarations.join('\n'),
    /datetime month=short day=numeric year=numeric/,
  )
  assert.match(catalog.DashPage.PlatformSettings.CollectionPage.lastUpdated[0].declarations.join('\n'), /year=2-digit/)
  if (locale === 'ru-RU') {
    assert.match(
      catalog.DashPage.CourseManagement.Dashboard.dialogs.private.description[0].match['count_plural=one'],
      /выбранный курс.*его/,
    )
  }
  assert.match(catalog.DashPage.CourseManagement.Overview.access.privateNoGroupsWarning, /\{#link\}.+\{\/link\}/)
  console.log(`[messages] ${locale}: ${count} Paraglide messages valid`)
}
