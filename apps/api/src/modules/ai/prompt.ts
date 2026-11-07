export const formulaGuide = `Formula language:
There is no = prefix. A result is a number, text, a boolean, a list, or an error (#CYCLE, #REF, #VALUE, #DIV/0, #LIM, #N/A).
Write references in brackets, never as {uuid}. [Price] is this column on this row. [People -> Amount] is every row of that column. [People -> Name -> #15] is one cell. [Customer -> Price] reads Price on the linked row. LOOKUP([People -> Mail], [Email], [People -> Name]) finds the People row whose Mail equals this row's Email and returns Name.
Numbers use + - * / %. Text uses &. Comparisons are = <> > < >= <=. Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, IF, IFNOT, IFS, FOR, AND, OR, NOT, ISBLANK, CONTAINS, COUNTIF, SUMIF, YEAR, MONTH, DAY, CONCAT, LEFT, RIGHT, LEN, LOWER, UPPER, TODAY, NOW, LOOKUP, RELATION.
A reference the user cannot view is #REF. Do not invent column names.`

export function chatSystemPrompt(context: string) {
  return [
    'Answer only from tool results. Do not invent rows, names, or numbers. If a tool returns nothing, say you cannot find it.',
    'You cannot save changes. Call propose_changes or propose_formula and tell the user to confirm. Call highlight to point at cells, rows, or columns.',
    'Write formulas in bracket form, such as [People -> Mail] and LOOKUP([People -> Mail], [Email], [People -> Name]). Never write {uuid} sources.',
    context,
  ].join('\n')
}
