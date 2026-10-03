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

// The entry chunk (G-05): a feature's route.ts and the unsplit options of a route are in it (AGENTS.md "Entry chunk").
const SPLIT_OPTIONS = new Set(['loader', 'component', 'pendingComponent', 'errorComponent', 'notFoundComponent'])
const SDK_RUNTIME = /^#\/shared\/api\/(gen\/(sdk|valibot)\.gen|gen\/@tanstack\/|client$)/
const importSource = (node: Node): string => {
  const source = child(node, 'source')?.['value']
  return typeof source === 'string' ? source : ''
}

const walk = (value: unknown, visit: (node: Node) => void): void => {
  if (Array.isArray(value)) value.forEach(item => walk(item, visit))
  else if (isNode(value)) {
    visit(value)
    for (const [key, item] of Object.entries(value)) if (key !== 'parent') walk(item, visit)
  }
}

const routeEntryImports: Rule = {
  create: context => ({
    ImportDeclaration(node) {
      const source = importSource(node)
      if (node['importKind'] === 'type' || !(source.startsWith('.') || SDK_RUNTIME.test(source))) return
      context.report({
        node,
        message:
          'route.ts is in the entry chunk: define route-level code here (no static import of the feature or the SDK); load the rest with import().',
      })
    },
  }),
}

// validateSearch, search, beforeLoad, loaderDeps, head, staticData stay in the route tree: they may use a feature
// only through #/features/<name>/route; its index (UI, queries) is for loader and the components.
const routeLevelImports: Rule = {
  create: context => {
    const fromIndex = new Map<string, string>()
    return {
      ImportDeclaration(node) {
        const feature = /^#\/features\/([^/]+)$/.exec(importSource(node))?.[1]
        const specifiers = node['specifiers']
        if (!feature || node['importKind'] === 'type' || !Array.isArray(specifiers)) return
        for (const specifier of specifiers.filter(isNode)) {
          const local = child(specifier, 'local')?.['name']
          if (specifier['importKind'] !== 'type' && typeof local === 'string') fromIndex.set(local, feature)
        }
      },
      CallExpression(node) {
        const factory = child(node, 'callee')
        if (factory?.type !== 'CallExpression' || child(factory, 'callee')?.['name'] !== 'createFileRoute') return
        const options = Array.isArray(node['arguments']) ? node['arguments'][0] : null
        const properties = isNode(options) && Array.isArray(options['properties']) ? options['properties'] : []
        for (const property of properties.filter(isNode)) {
          if (SPLIT_OPTIONS.has(String(child(property, 'key')?.['name']))) continue
          walk(child(property, 'value'), used => {
            const feature = used.type === 'Identifier' ? fromIndex.get(String(used['name'])) : undefined
            if (feature)
              context.report({
                node: used,
                message: `Route-level options are in the entry chunk: import ${String(used['name'])} from #/features/${feature}/route (move it there).`,
              })
          })
        }
      },
    }
  },
}

export default {
  meta: { name: 'ab' },
  rules: {
    'no-jsx-literal': noJsxLiteral,
    'no-empty-fallback': noEmptyFallback,
    'no-literal-query-key': noLiteralQueryKey,
    'no-dynamic-message': noDynamicMessage,
    'route-entry-imports': routeEntryImports,
    'route-level-imports': routeLevelImports,
  },
}
