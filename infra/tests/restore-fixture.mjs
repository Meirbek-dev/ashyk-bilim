// Synthetic user work only; invoked inside the isolated stand's browser container by restore-test.sh.
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const origin = process.env.E2E_BASE_URL
const password = process.env.E2E_PASSWORD
assert(origin && password, 'fixture needs the isolated stand and seed password')
async function login(login) {
  const response = await fetch(`${origin}/api/v2/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }),
  })
  assert.equal(response.status, 200)
  return response.headers.getSetCookie().find(value => value.startsWith('ab_session='))?.split(';')[0]
}
const teacher = await login('e2e-teacher')
const learner = await login('e2e-student1')
async function api(cookie, method, path, body, headers = {}) {
  const response = await fetch(`${origin}/api/v2/${path}`, {
    method, headers: { cookie, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert(response.ok, `${method} ${path}: ${response.status}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
const course = await api(teacher, 'POST', 'courses', { name: 'Restore integrity fixture' })
const chapter = await api(teacher, 'POST', `courses/${course.id}/chapters`, { name: 'Preserved chapter' })
const lesson = await api(teacher, 'POST', `chapters/${chapter.id}/activities`, {
  name: 'Preserved lesson', activity_type: 'dynamic', activity_sub_type: 'dynamic_page',
})
await api(teacher, 'PATCH', `activities/${lesson.id}`, { published: true })
const quiz = await api(teacher, 'POST', 'assessments', { chapter_id: chapter.id, kind: 'quiz', title: 'Preserved quiz' })
const item = await api(teacher, 'POST', `assessments/${quiz.id}/items`, {
  title: 'Preserved answer', max_score: 1,
  body: { kind: 'choice', variant: 'single_choice', prompt: 'Choose A', options: [
    { id: 'a', text: 'A', is_correct: true }, { id: 'b', text: 'B', is_correct: false },
  ] },
})
await api(teacher, 'POST', `assessments/${quiz.id}/lifecycle`, { to: 'published' })
await api(teacher, 'POST', `courses/${course.id}/lifecycle`, { action: 'publish' })
await api(learner, 'POST', `enrollments/${course.id}`, {})
const submission = await api(learner, 'POST', `assessments/${quiz.id}/submissions`, {})
await api(learner, 'POST', `submissions/${submission.id}/submit`, { answers: { [item.id]: { kind: 'choice', selected: ['a'] } } })
await api(learner, 'POST', `courses/${course.id}/discussions`, { content: 'Preserved learner discussion' })
await api(teacher, 'POST', 'certifications', { course_id: course.id })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const upload = await api(teacher, 'POST', 'uploads', { purpose: 'block-image', mime: 'image/png', size_bytes: png.length })
const stored = await fetch(upload.put_url, {
  method: 'PUT', body: png, headers: { 'content-type': 'image/png', 'if-none-match': '*' },
})
assert(stored.ok, `image PUT: ${stored.status} ${(await stored.text()).slice(0, 500)}`)
await api(teacher, 'POST', `uploads/${upload.id}/finalize`, {})
await api(teacher, 'POST', `activities/${lesson.id}/blocks`, { block_type: 'image', upload_id: upload.id })
writeFileSync(new URL('../../tmp/restore-test/object-key', import.meta.url), upload.key)
console.log('Synthetic course, learner submission, discussion, certificate template and image created')
