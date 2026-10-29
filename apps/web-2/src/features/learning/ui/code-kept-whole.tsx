/** The line with the code on one line: a phone broke «FYX8-TPKX-» from «X7EY-XH55» at a dash, as if two codes. */
export function CodeKeptWhole({ text, code }: { text: string; code: string }) {
  const at = text.indexOf(code)
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <span className="whitespace-nowrap">{code}</span>
      {text.slice(at + code.length)}
    </>
  )
}
