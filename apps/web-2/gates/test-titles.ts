import ts from 'typescript-6'

/** Only executable test/suite titles count; skipped suites exclude their descendants too. */
export function titleIds(source: string): { text: string; line: number }[] {
  const file = ts.createSourceFile('test.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: { text: string; line: number }[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(file)
      const test = /^(test\d*|it|describe)(?:[.(]|$)/.test(expression)
      if (test && /\.(skip|todo|fixme)\b/.test(expression)) return
      const title = node.arguments[0]
      const text =
        title &&
        (ts.isStringLiteralLike(title)
          ? title.text
          : ts.isTemplateExpression(title)
            ? [title.head.text, ...title.templateSpans.map(span => span.literal.text)].join(' ')
            : '')
      if (test && title && text) {
        const line = file.getLineAndCharacterOfPosition(title.getStart(file)).line + 1
        for (const id of text.matchAll(/\bB-[A-Z]+-\d+\b/g)) found.push({ text: id[0], line })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}
