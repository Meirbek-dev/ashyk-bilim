#!/usr/bin/env node
/**
 * Post-processes the Orval output under `src/lib/api/generated`:
 *
 *  - turns the `import type { … } from '../zod'` lines of every tag file into
 *    value imports (the zod schema objects double as response parsers);
 *  - injects the response parser as the third `orvalMutator(...)` argument so
 *    every generated call validates its payload (`zod.parse`) or, for
 *    primitive/array/void responses, uses the small helpers from the mutator;
 *  - keeps the react-query imports value-imports where hooks are used.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const generatedDir = path.resolve(import.meta.dirname, '..', 'src/lib/api/generated')

const mutatorHelpers = new Set([
  'arrayParser',
  'nullableParser',
  'stringParser',
  'stringifyQueryParam',
  'unknownParser',
  'voidParser',
])

function generatedOperationFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'zod') return []
      return generatedOperationFiles(fullPath)
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return []
    if (entry.name === 'index.ts') return []
    return [fullPath]
  })
}

function findMatchingParen(source, openIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = null
      continue
    }

    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function parserForType(typeName, helpersUsed) {
  const normalized = typeName.trim()

  if (normalized.endsWith('[]')) {
    helpersUsed.add('arrayParser')
    return `arrayParser(${parserForType(normalized.slice(0, -2), helpersUsed)})`
  }

  const nullableMatch = normalized.match(/^(.+)\s+\|\s+null$/u) ?? normalized.match(/^null\s+\|\s+(.+)$/u)
  if (nullableMatch) {
    helpersUsed.add('nullableParser')
    return `nullableParser(${parserForType(nullableMatch[1], helpersUsed)})`
  }

  if (normalized === 'void') {
    helpersUsed.add('voidParser')
    return 'voidParser'
  }
  if (normalized === 'string') {
    helpersUsed.add('stringParser')
    return 'stringParser'
  }
  if (normalized === 'unknown') {
    helpersUsed.add('unknownParser')
    return 'unknownParser'
  }

  return normalized
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function injectResponseParsers(source) {
  const helpersUsed = new Set()
  let output = ''
  let cursor = 0
  const callPattern = /orvalMutator<([^>]+)>\(/gu
  let match

  while ((match = callPattern.exec(source))) {
    const openParenIndex = callPattern.lastIndex - 1
    const closeParenIndex = findMatchingParen(source, openParenIndex)
    if (closeParenIndex === -1) continue

    const parser = parserForType(match[1], helpersUsed)
    const argsSource = source.slice(openParenIndex + 1, closeParenIndex)
    const parserAtEnd = new RegExp(`,\\s*${escapeRegExp(parser)}\\s*,?\\s*$`, 'u')
    if (parserAtEnd.test(argsSource)) continue

    const lineStart = source.lastIndexOf('\n', closeParenIndex) + 1
    const closeIndent = source.slice(lineStart, closeParenIndex).match(/^\s*/u)?.[0] ?? ''
    const closeLinePrefix = source.slice(lineStart, closeParenIndex)

    if (closeLinePrefix.trim() === '') {
      let insertionIndex = lineStart
      if (source[insertionIndex - 1] === '\n') insertionIndex -= 1
      if (source[insertionIndex - 1] === '\r') insertionIndex -= 1
      let previousTokenIndex = insertionIndex - 1
      while (/\s/u.test(source[previousTokenIndex] ?? '')) previousTokenIndex -= 1
      const leadingComma = source[previousTokenIndex] === ',' ? '' : ','
      output += source.slice(cursor, insertionIndex)
      output += `${leadingComma}\n${closeIndent}  ${parser},\n`
      cursor = lineStart
    } else {
      output += source.slice(cursor, closeParenIndex)
      output += `, ${parser}`
      cursor = closeParenIndex
    }
    callPattern.lastIndex = closeParenIndex + 1
  }

  output += source.slice(cursor)

  return { source: output, helpersUsed }
}

for (const filePath of generatedOperationFiles(generatedDir)) {
  if (!statSync(filePath).isFile()) continue

  let source = readFileSync(filePath, 'utf8')
  if (!source.includes('orvalMutator<')) continue

  source = source.replace(/^import type \{([^}]*)\} from '\.\.\/zod'$/gmu, "import {$1} from '../zod'")
  source = source.replace(
    /^import type \{ useMutation, useQuery, useSuspenseQuery \} from '@tanstack\/react-query'$/mu,
    "import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'",
  )
  source = source.replace(
    /^import type \{([^}\n]*(?:useMutation|useQuery|useSuspenseQuery)[^}\n]*)\} from '@tanstack\/react-query'$/gmu,
    "import {$1} from '@tanstack/react-query'",
  )
  source = source.replace(
    /^import \{$([\s\S]*?)^\} from '@tanstack\/react-query'$/mu,
    "import type {$1} from '@tanstack/react-query'",
  )
  const usesQueryStringifier = source.includes('String(value)')
  source = source.replace(/\bString\(value\)/gu, 'stringifyQueryParam(value)')

  const injected = injectResponseParsers(source)
  if (usesQueryStringifier) {
    injected.helpersUsed.add('stringifyQueryParam')
  }
  source = injected.source

  if (injected.helpersUsed.size > 0) {
    const helperImports = [...mutatorHelpers].filter(helper => injected.helpersUsed.has(helper))
    source = source.replace(
      /import \{ orvalMutator \} from '..\/..\/orval-mutator'/u,
      `import { ${['orvalMutator', ...helperImports].join(', ')} } from '../../orval-mutator'`,
    )
  }

  writeFileSync(filePath, source)
}
