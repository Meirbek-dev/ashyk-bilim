import * as v from 'valibot'

import type { CodeBody, CodeTestCase } from '#/shared/api/gen/types.gen'

// The code item's form keeps numbers as typed text (blank = the sandbox default) and turns into a `CodeBody` on save.
// The contract declares no ranges for limits and weights (SPEC "Ждёт сервера"): only the shape is checked here.

const wholeOrBlank = v.pipe(v.string(), v.trim(), v.regex(/^([1-9]\d*)?$/))
const positive = v.pipe(v.string(), v.trim(), v.regex(/^[1-9]\d*$/))

const testSchema = v.object({
  id: v.string(),
  description: v.string(),
  input: v.string(),
  expected: v.string(),
  visible: v.boolean(),
  weight: positive,
})

export const codeFormSchema = v.object({
  prompt: v.string(),
  input_spec: v.string(),
  output_spec: v.string(),
  constraints: v.string(),
  languages: v.array(v.number()),
  starter: v.record(v.string(), v.string()),
  reference: v.record(v.string(), v.string()),
  tests: v.array(testSchema),
  time: wholeOrBlank,
  memory: wholeOrBlank,
})
export type CodeForm = v.InferOutput<typeof codeFormSchema>
export type TestForm = CodeForm['tests'][number]

const text = (value: number | null) => (value === null ? '' : String(value))
const blankNull = (value: string) => (value.trim() === '' ? null : Number(value.trim()))

export function codeForm(body: CodeBody): CodeForm {
  return {
    prompt: body.prompt ?? '',
    input_spec: body.input_spec ?? '',
    output_spec: body.output_spec ?? '',
    constraints: (body.constraints ?? []).join('\n'),
    languages: body.languages ?? [],
    starter: body.starter_code ?? {},
    reference: body.reference_solutions ?? {},
    tests: (body.tests ?? []).map(test => ({
      id: test.id,
      description: test.description ?? '',
      input: test.input ?? '',
      expected: test.expected_output ?? '',
      visible: test.is_visible ?? true,
      weight: String(test.weight ?? 1),
    })),
    time: text(body.time_limit_seconds),
    memory: text(body.memory_limit_mb),
  }
}

/** A new test: visible, weight 1, its own id (the grader keys results by it). */
export const newTest = (): TestForm => ({
  id: crypto.randomUUID(),
  description: '',
  input: '',
  expected: '',
  visible: true,
  weight: '1',
})

/** The form as a body. What it does not edit (match modes, scoring, output cap) is kept from the stored body. */
export function codeBodyOf(form: CodeForm, stored: CodeBody): CodeBody {
  const before = new Map((stored.tests ?? []).map(test => [test.id, test]))
  const tests = form.tests.map((test): CodeTestCase => ({
    ...before.get(test.id),
    id: test.id,
    description: test.description.trim() === '' ? null : test.description,
    input: test.input,
    expected_output: test.expected,
    is_visible: test.visible,
    weight: Number(test.weight.trim()),
  }))
  return {
    ...stored,
    prompt: form.prompt,
    input_spec: form.input_spec,
    output_spec: form.output_spec,
    constraints: form.constraints
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== ''),
    languages: form.languages,
    starter_code: form.starter,
    reference_solutions: form.reference,
    tests,
    time_limit_seconds: blankNull(form.time),
    memory_limit_mb: blankNull(form.memory),
  }
}

/** Whether the form differs from the stored body (both read through the form, so untouched shapes compare equal). */
export const bodyChanged = (form: CodeForm, stored: CodeBody) =>
  JSON.stringify(codeBodyOf(form, stored)) !== JSON.stringify(codeBodyOf(codeForm(stored), stored))

export const testCounts = (tests: Pick<TestForm, 'visible'>[]) => {
  const visible = tests.filter(test => test.visible).length
  return { visible, hidden: tests.length - visible }
}
