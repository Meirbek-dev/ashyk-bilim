import { tagHighlighter, tags } from '@lezer/highlight'

/**
 * Code colors everywhere code is shown (the code editor, editor code blocks, rendered markdown): theme tokens as
 * classes (status inks hold 4.5:1 on background in every theme, DESIGN 2), so light and dark follow the page.
 */
export const codeHighlighter = tagHighlighter([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword, tags.self],
    class: 'text-info font-medium',
  },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'text-info' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'text-success' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.escape], class: 'text-warning' },
  { tag: [tags.comment, tags.meta], class: 'text-muted-foreground' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName)],
    class: 'font-medium',
  },
  { tag: [tags.operator, tags.punctuation], class: 'text-muted-foreground' },
  { tag: tags.invalid, class: 'text-destructive' },
  // Markup in code blocks (HTML, markdown).
  { tag: [tags.tagName, tags.heading], class: 'text-info font-medium' },
  { tag: tags.attributeName, class: 'text-warning' },
  { tag: [tags.link, tags.url], class: 'text-info' },
  { tag: tags.strong, class: 'font-semibold' },
  { tag: tags.emphasis, class: 'italic' },
])
