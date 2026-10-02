import type { Element, Root, RootContent } from 'hast'

const isElement = (node: Root | RootContent): node is Element => node.type === 'element'

function visit(node: Root | RootContent): void {
  const href = isElement(node) && node.tagName === 'a' ? node.properties['href'] : null
  if (isElement(node) && typeof href === 'string' && /^https?:\/\//i.test(href)) {
    node.properties['target'] = '_blank'
    node.properties['rel'] = ['noopener', 'noreferrer']
  }
  if ('children' in node) for (const child of node.children) visit(child)
}

/** rehype plugin: absolute links open in a new tab without the opener (relative ones stay in the app). */
export const rehypeExternalLinks = () => visit
