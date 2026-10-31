export type FormulaHelp = {
  name: string
  insert: string
  example: string
}

export const FORMULA_HELP: FormulaHelp[] = [
  { name: 'SUM', insert: 'SUM()', example: 'SUM(Amount)' },
  { name: 'AVERAGE', insert: 'AVERAGE()', example: 'AVERAGE(Amount)' },
  { name: 'MIN', insert: 'MIN()', example: 'MIN(Amount)' },
  { name: 'MAX', insert: 'MAX()', example: 'MAX(Amount)' },
  { name: 'COUNT', insert: 'COUNT()', example: 'COUNT(Amount)' },
  { name: 'COUNTA', insert: 'COUNTA()', example: 'COUNTA(Notes)' },
  { name: 'ROUND', insert: 'ROUND()', example: 'ROUND(Amount, 2)' },
  { name: 'ABS', insert: 'ABS()', example: 'ABS(Amount)' },
  { name: 'IF', insert: 'IF()', example: 'IF(Amount > 100, "High", "Low")' },
  { name: 'IFNOT', insert: 'IFNOT()', example: 'IFNOT(Paid, "Open", "Done")' },
  { name: 'IFS', insert: 'IFS()', example: 'IFS(Amount > 100, "High", Amount > 0, "Low")' },
  { name: 'FOR', insert: 'FOR()', example: 'FOR(Amount, IF(IT > 100, "High", "Low"))' },
  { name: 'AND', insert: 'AND()', example: 'AND(Amount > 0, Paid)' },
  { name: 'OR', insert: 'OR()', example: 'OR(Status = "Open", Status = "Pending")' },
  { name: 'NOT', insert: 'NOT()', example: 'NOT(Paid)' },
  { name: 'ISBLANK', insert: 'ISBLANK()', example: 'ISBLANK(Notes)' },
  { name: 'CONTAINS', insert: 'CONTAINS()', example: 'CONTAINS(Tags, "Lead")' },
  { name: 'COUNTIF', insert: 'COUNTIF()', example: 'COUNTIF(Status, "Open")' },
  { name: 'SUMIF', insert: 'SUMIF()', example: 'SUMIF(Status, "Open", Amount)' },
  { name: 'YEAR', insert: 'YEAR()', example: 'YEAR(Date)' },
  { name: 'MONTH', insert: 'MONTH()', example: 'MONTH(Date)' },
  { name: 'DAY', insert: 'DAY()', example: 'DAY(Date)' },
  { name: 'CONCAT', insert: 'CONCAT()', example: 'CONCAT(First, " ", Last)' },
  { name: 'LEFT', insert: 'LEFT()', example: 'LEFT(Name, 1)' },
  { name: 'RIGHT', insert: 'RIGHT()', example: 'RIGHT(Code, 2)' },
  { name: 'LEN', insert: 'LEN()', example: 'LEN(Name)' },
  { name: 'LOWER', insert: 'LOWER()', example: 'LOWER(Email)' },
  { name: 'UPPER', insert: 'UPPER()', example: 'UPPER(Code)' },
  { name: 'TODAY', insert: 'TODAY()', example: 'TODAY()' },
  { name: 'NOW', insert: 'NOW()', example: 'NOW()' },
  { name: 'LOOKUP', insert: 'LOOKUP()', example: 'LOOKUP([People -> Mail], [Email], [People -> Name])' },
  { name: 'RELATION', insert: 'RELATION()', example: '[Customer -> Price]' },
]

export function formatFormulaValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (Array.isArray(value)) return value.map((item) => formatFormulaValue(item)).join(', ')
  if (typeof value === 'object' && 'error' in value) return String((value as { error: unknown }).error)
  return String(value)
}
