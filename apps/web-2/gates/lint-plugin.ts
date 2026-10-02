// Project lint rules oxlint has no built-in for (spec 7.3). Loaded by vite.config.ts `lint.jsPlugins`.
// Each message names the one allowed way, so the fix needs no documentation lookup.

type Node = { type: string; [key: string]: unknown }
type Context = { report: (descriptor: { node: Node; message: string }) => void }
type Rule = { create: (context: Context) => Record<string, (node: Node) => void> }

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
const child = (node: Node, key: string): Node | null => {
  const value = node[key]
  return isNode(value) ? value : null
}
const isStringLiteral = (node: Node | null): node is Node & { value: string } =>
  node?.type === 'Literal' && typeof node['value'] === 'string'

const TEXT_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'title', 'alt', 'placeholder', 'label'])
const LETTER = /\p{L}/u
const TEXT_MESSAGE = 'User-visible text comes from the catalog: m.<feature>_<key>() (messages/<locale>/<feature>.json).'

const noJsxLiteral: Rule = {
  create: context => ({
    JSXText(node) {
      if (LETTER.test(String(node['value']))) context.report({ node, message: TEXT_MESSAGE })
    },
    JSXExpressionContainer(node) {
      const expression = child(node, 'expression')
      if (isStringLiteral(expression) && LETTER.test(expression.value)) context.report({ node, message: TEXT_MESSAGE })
    },
    JSXAttribute(node) {
      const name = child(node, 'name')?.['name']
      const value = child(node, 'value')
      if (typeof name === 'string' && TEXT_ATTRIBUTES.has(name) && isStringLiteral(value) && LETTER.test(value.value)) {
        context.report({ node, message: TEXT_MESSAGE })
      }
    },
  }),
}

// True for `data`, `query.data`, `data?.items`...: the chain reads a query result.
const readsQueryData = (node: Node | null): boolean => {
  if (node?.type === 'Identifier') return node['name'] === 'data'
  if (node?.type === 'ChainExpression') return readsQueryData(child(node, 'expression'))
  if (node?.type !== 'MemberExpression') return false
  return child(node, 'property')?.['name'] === 'data' || readsQueryData(child(node, 'object'))
}

const noEmptyFallback: Rule = {
  create: context => ({
    LogicalExpression(node) {
      const right = child(node, 'right')
      const elements = right?.type === 'ArrayExpression' ? right['elements'] : null
      const empty = Array.isArray(elements) && elements.length === 0
      if (empty && (node['operator'] === '??' || node['operator'] === '||') && readsQueryData(child(node, 'left'))) {
        context.report({
          node,
          message:
            'Do not hide query state behind ?? []: render ListState (loading, empty, no match, error) from the query.',
        })
      }
    },
  }),
}

const noLiteralQueryKey: Rule = {
  create: context => ({
    Property(node) {
      if (child(node, 'key')?.['name'] === 'queryKey' && child(node, 'value')?.type === 'ArrayExpression') {
        context.report({
          node,
          message: 'Use the generated key: xQueryKey() from #/shared/api/gen/@tanstack/react-query.gen.',
        })
      }
    },
  }),
}

const noDynamicMessage: Rule = {
  create: context => ({
    MemberExpression(node) {
      const object = child(node, 'object')
      if (node['computed'] === true && object?.type === 'Identifier' && object['name'] === 'm') {
        context.report({
          node,
          message: 'No dynamic message keys: map the value with a Record<Enum, () => string> of m.<key> functions.',
        })
      }
    },
  }),
}

export default {
  meta: { name: 'ab' },
  rules: {
    'no-jsx-literal': noJsxLiteral,
    'no-empty-fallback': noEmptyFallback,
    'no-literal-query-key': noLiteralQueryKey,
    'no-dynamic-message': noDynamicMessage,
  },
}
