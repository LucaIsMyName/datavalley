import { FORMULA_HELP } from './formula-help'

export function insertSnippet(value: string, start: number, end: number, snippet: string) {
  const next = value.slice(0, start) + snippet + value.slice(end)
  const cursor = start + (snippet.endsWith('()') ? snippet.length - 1 : snippet.length)
  return { value: next, cursor }
}

export function matchingFunctions(value: string, cursor: number) {
  const token = value.slice(0, cursor).match(/[A-Za-z_]*$/)?.[0]?.toUpperCase() ?? ''
  if (!token) return FORMULA_HELP
  return FORMULA_HELP.filter((item) => item.name.startsWith(token))
}
