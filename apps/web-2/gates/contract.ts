// G-08: the server contract is generator-friendly (spec 3.3, S-01). Reads ../server/openapi.v2.json as is.
import type { Finding } from './lib.ts'
import { read } from './lib.ts'

const FILE = '../server/openapi.v2.json'
const FREE_FORM_ALLOWED = new Set(['EditorDocument'])
type Json = { [key: string]: unknown }

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const hasType = (schema: Json) =>
  ['type', '$ref', 'oneOf', 'anyOf', 'allOf', 'enum', 'const'].some(key => key in schema)
const isNullable = (schema: Json): boolean => {
  const type = schema['type']
  if (type === 'null' || (Array.isArray(type) && type.includes('null'))) return true
  return ['oneOf', 'anyOf'].some(key => {
    const variants = schema[key]
    return Array.isArray(variants) && variants.some(variant => isObject(variant) && isNullable(variant))
  })
}
const isBareObject = (schema: Json): boolean => {
  const type = schema['type']
  const objectType = type === 'object' || (Array.isArray(type) && type.includes('object'))
  return objectType && !isObject(schema['properties']) && !isObject(schema['additionalProperties'])
}

function checkProperties(schema: Json, pointer: string, findings: Finding[]): void {
  const properties = schema['properties']
  if (!isObject(properties)) return
  const required = Array.isArray(schema['required']) ? schema['required'] : []
  for (const [name, property] of Object.entries(properties)) {
    if (!isObject(property)) continue
    const at = `${FILE}#${pointer}/properties/${name}`
    if (!hasType(property))
      findings.push({ file: at, rule: 'contract-untyped', fix: 'give the property a type or a named schema' })
    if (!required.includes(name) && isNullable(property)) {
      findings.push({
        file: at,
        rule: 'contract-optional-nullable',
        fix: 'make it required-nullable or optional, not both',
      })
    }
  }
}

function visit(node: unknown, pointer: string, findings: Finding[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => visit(item, `${pointer}/${index}`, findings))
    return
  }
  if (!isObject(node)) return
  checkProperties(node, pointer, findings)
  if (node['format'] === 'int64') {
    findings.push({
      file: `${FILE}#${pointer}`,
      rule: 'contract-int64',
      fix: 'use the named UnixTime / int32 schema (int64 becomes bigint)',
    })
  }
  const schemaName = /^\/components\/schemas\/([^/]+)/.exec(pointer)?.[1] ?? ''
  if (isBareObject(node) && !FREE_FORM_ALLOWED.has(schemaName)) {
    findings.push({
      file: `${FILE}#${pointer}`,
      rule: 'contract-bare-object',
      fix: 'describe the object (tagged union or named schema)',
    })
  }
  for (const [key, value] of Object.entries(node)) visit(value, `${pointer}/${key.replaceAll('/', '~1')}`, findings)
}

export function contract(): Finding[] {
  const document: unknown = JSON.parse(read(FILE))
  const findings: Finding[] = []
  const operationIds = new Map<string, number>()
  const paths = isObject(document) && isObject(document['paths']) ? document['paths'] : {}
  for (const item of Object.values(paths)) {
    if (!isObject(item)) continue
    for (const operation of Object.values(item)) {
      const id = isObject(operation) ? operation['operationId'] : undefined
      if (typeof id === 'string') operationIds.set(id, (operationIds.get(id) ?? 0) + 1)
    }
  }
  for (const [id, count] of operationIds) {
    if (count > 1) {
      findings.push({
        file: FILE,
        rule: 'contract-duplicate-operation-id',
        fix: `operationId "${id}" is used ${count} times: make it unique`,
      })
    }
  }
  visit(document, '', findings)
  return findings
}
