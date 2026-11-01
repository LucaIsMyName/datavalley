export const CSV_DELIMITER_PRESETS = [',', ';', '\t', '|'] as const

export type CsvDelimiterPreset = (typeof CSV_DELIMITER_PRESETS)[number]

export function normalizeCsvDelimiter(input: string | undefined): string {
  if (input === undefined || input === '') return ','
  const raw = input.trim()
  if (raw === 'tab') return '\t'
  if (raw.length === 1) return raw
  throw new Error('CSV delimiter must be a single character')
}

export function uniqueColumnNames(headers: string[]): string[] {
  const used = new Map<string, number>()
  return headers.map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    if (count === 0) return base
    let next = count + 1
    let name = `${base} ${next}`
    while (used.has(name)) {
      next += 1
      name = `${base} ${next}`
    }
    used.set(name, 1)
    return name
  })
}

export function csvTable(
  input: string,
  headerRow: boolean,
  delimiter = ',',
): { names: string[]; records: string[][] } {
  const grid = parseCsv(input, delimiter)
  if (grid.length === 0) return { names: [], records: [] }
  const width = Math.max(0, ...grid.map((row) => row.length))
  if (width === 0) return { names: [], records: [] }
  const pad = (row: string[]) => Array.from({ length: width }, (_, index) => row[index] ?? '')
  if (headerRow) return { names: uniqueColumnNames(pad(grid[0] ?? [])), records: grid.slice(1).map(pad) }
  return {
    names: uniqueColumnNames(Array.from({ length: width }, (_, index) => `Column ${index + 1}`)),
    records: grid.map(pad),
  }
}

export function parseCsv(input: string, delimiter = ','): string[][] {
  if (delimiter.length !== 1) throw new Error('CSV delimiter must be a single character')
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells, index) => cells.some((cell) => cell.length > 0) || index === 0)
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
          return cell
        })
        .join(','),
    )
    .join('\n')
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
