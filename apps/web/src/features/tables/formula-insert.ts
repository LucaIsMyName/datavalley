import { FORMULA_HELP } from './formula-help'

export function insertSnippet(value: string, start: number, end: number, snippet: string) {
  const next = value.slice(0, start) + snippet + value.slice(end)
  const cursor = start + (snippet.endsWith('()') ? snippet.length - 1 : snippet.length)
  return { value: next, cursor }
}

export function thisRowReference(columnName: string) {
  return `[${columnName}]`
}

export function cellReference(tableName: string, columnName: string, rowNumber: number) {
  return `[${tableName} -> ${columnName} -> #${rowNumber}]`
}

export function columnReference(tableName: string, columnName: string) {
  return `[${tableName} -> ${columnName}]`
}

export function relationReference(relationName: string, fieldName: string) {
  return `[${relationName} -> ${fieldName}]`
}

export function aggregateReference(fn: string, tableName: string, columnName: string) {
  return `${fn}(${columnReference(tableName, columnName)})`
}

export function lookupReference(matchTable: string, matchColumn: string, needle: string, resultTable: string, resultColumn: string) {
  return `LOOKUP(${columnReference(matchTable, matchColumn)}, ${thisRowReference(needle)}, ${columnReference(resultTable, resultColumn)})`
}

export function matchingFunctions(value: string, cursor: number) {
  const token = value.slice(0, cursor).match(/[A-Za-z_]*$/)?.[0]?.toUpperCase() ?? ''
  if (!token) return FORMULA_HELP
  return FORMULA_HELP.filter((item) => item.name.startsWith(token))
}
