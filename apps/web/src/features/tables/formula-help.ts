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
  { name: 'AND', insert: 'AND()', example: 'AND(Amount > 0, Paid)' },
  { name: 'OR', insert: 'OR()', example: 'OR(Status = "Open", Status = "Pending")' },
  { name: 'NOT', insert: 'NOT()', example: 'NOT(Paid)' },
  { name: 'CONCAT', insert: 'CONCAT()', example: 'CONCAT(First, " ", Last)' },
  { name: 'LEFT', insert: 'LEFT()', example: 'LEFT(Name, 1)' },
  { name: 'RIGHT', insert: 'RIGHT()', example: 'RIGHT(Code, 2)' },
  { name: 'LEN', insert: 'LEN()', example: 'LEN(Name)' },
  { name: 'LOWER', insert: 'LOWER()', example: 'LOWER(Email)' },
  { name: 'UPPER', insert: 'UPPER()', example: 'UPPER(Code)' },
  { name: 'TODAY', insert: 'TODAY()', example: 'TODAY()' },
  { name: 'NOW', insert: 'NOW()', example: 'NOW()' },
  { name: 'LOOKUP', insert: 'LOOKUP()', example: 'LOOKUP(Customers.Email, Email, Customers.Name)' },
]
