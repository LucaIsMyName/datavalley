export type ExampleTokenType = 'keyword' | 'string' | 'number' | 'punctuation' | 'text'
export type ExampleToken = { type: ExampleTokenType; text: string }

const KEYWORDS = new Set(['const', 'await'])

export function tokenizeExample(source: string): ExampleToken[] {
  const tokens: ExampleToken[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      let end = i + 1
      while (end < source.length && source[end] !== quote) {
        if (source[end] === '\\') end += 2
        else end += 1
      }
      if (end < source.length) end += 1
      tokens.push({ type: 'string', text: source.slice(i, end) })
      i = end
      continue
    }
    if (/[0-9]/.test(ch)) {
      let end = i + 1
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1
      tokens.push({ type: 'number', text: source.slice(i, end) })
      i = end
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let end = i + 1
      while (end < source.length && /[\w$]/.test(source[end])) end += 1
      const text = source.slice(i, end)
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'text', text })
      i = end
      continue
    }
    if (/[{}()[\],.;:=<>!]/.test(ch)) {
      tokens.push({ type: 'punctuation', text: ch })
      i += 1
      continue
    }
    let end = i + 1
    while (end < source.length && !/["'0-9A-Za-z_${}()[\],.;:=<>!]/.test(source[end])) end += 1
    tokens.push({ type: 'text', text: source.slice(i, end) })
    i = end
  }
  return tokens
}
