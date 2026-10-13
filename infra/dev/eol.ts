// `just eol`: rewrite CRLF working-tree copies of text files as LF (the index is LF already, .gitattributes).
// Only files without staged or unstaged changes, so nobody's work in progress is touched. `git add` then refreshes
// their index entries (same blob; git otherwise reports a file whose size changed as modified).
import { readFileSync, writeFileSync } from 'node:fs'

const git = (...args: string[]) => Bun.spawnSync(['git', ...args]).stdout.toString()
const dirty = new Set(git('diff', '--name-only', '-z', 'HEAD').split('\0'))
const fixed: string[] = []
for (const line of git('ls-files', '--eol', '-z').split('\0')) {
  // "i/lf    w/crlf  attr/text=auto eol=lf <TAB>path"
  const [info = '', path = ''] = line.split('\t')
  if (!/w\/(crlf|mixed)/.test(info) || !/i\/lf/.test(info) || dirty.has(path)) continue
  writeFileSync(path, readFileSync(path, 'latin1').replaceAll('\r\n', '\n'), 'latin1') // byte-preserving
  fixed.push(path)
}
if (fixed.length) Bun.spawnSync(['git', 'add', '--', ...fixed], { stdout: 'inherit', stderr: 'inherit' })
console.log(
  `eol: ${fixed.length} file(s) rewritten as LF${fixed.length ? `\n  ${fixed.slice(0, 20).join('\n  ')}` : ''}`,
)
if (fixed.length > 20) console.log(`  ... and ${fixed.length - 20} more`)
