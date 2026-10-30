import { escapeLike, isFilterGroup, type FilterCondition, type FilterNode } from '@datavalley/shared'
import { sql, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { badRequest } from '../../errors.js'
import { operatorsFor, type ColumnShape } from '../../column-types/index.js'

export type SortSpec = { columnId: string; direction: 'asc' | 'desc' }

type Cursor = {
  position: string
  id: string
  sort: string | null
  sortNull: boolean
}

export type RowPage = {
  id: string
  position: string
  version: number
  color: string | null
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor
    if (!parsed.position || !parsed.id) throw new Error('cursor')
    return parsed
  } catch {
    throw badRequest('Invalid cursor')
  }
}

async function many<T extends Record<string, unknown>>(db: AppDatabase, query: SQL): Promise<T[]> {
  const result = await db.execute(query)
  if (Array.isArray(result)) return result as T[]
  return ((result as { rows?: T[] }).rows ?? []) as T[]
}

function sortSql(type: string): SQL {
  if (type === 'number' || type === 'currency') return sql`sc.value_number`
  if (type === 'datetime') return sql`sc.value_timestamptz`
  if (type === 'checkbox') return sql`sc.value_bool::text`
  if (type === 'select' || type === 'radio') return sql`sc.value_jsonb->>'optionId'`
  return sql`sc.value_text`
}

function bindSort(type: string, value: string): SQL {
  if (type === 'number' || type === 'currency') return sql`${value}::numeric`
  if (type === 'datetime') return sql`${value}::timestamptz`
  return sql`${value}`
}

function compileCondition(condition: FilterCondition, columns: Map<string, ColumnShape>): SQL {
  const column = columns.get(condition.columnId)
  if (!column) throw badRequest('Unknown filter column')
  if (!operatorsFor(column.type).includes(condition.op)) throw badRequest(`Unsupported filter for ${column.type}`)
  const id = column.id
  if (condition.op === 'empty') {
    return sql`NOT EXISTS (SELECT 1 FROM table_cells c WHERE c.row_id = r.id AND c.column_id = ${id}::uuid)`
  }
  if (condition.op === 'not_empty') {
    return sql`EXISTS (SELECT 1 FROM table_cells c WHERE c.row_id = r.id AND c.column_id = ${id}::uuid)`
  }
  const predicate = comparison(column, condition)
  return sql`EXISTS (SELECT 1 FROM table_cells c WHERE c.row_id = r.id AND c.column_id = ${id}::uuid AND ${predicate})`
}

function comparison(column: ColumnShape, condition: FilterCondition): SQL {
  const value = condition.value
  const valueTo = condition.valueTo
  const text = (field: SQL) => {
    if (condition.op === 'eq') return sql`${field} = ${String(value ?? '')}`
    if (condition.op === 'neq') return sql`${field} <> ${String(value ?? '')}`
    if (condition.op === 'contains') return sql`${field} ILIKE ${'%' + escapeLike(String(value ?? '')) + '%'} ESCAPE '\\'`
    if (condition.op === 'not_contains') return sql`${field} NOT ILIKE ${'%' + escapeLike(String(value ?? '')) + '%'} ESCAPE '\\'`
    if (condition.op === 'starts_with') return sql`${field} ILIKE ${escapeLike(String(value ?? '')) + '%'} ESCAPE '\\'`
    if (condition.op === 'ends_with') return sql`${field} ILIKE ${'%' + escapeLike(String(value ?? ''))} ESCAPE '\\'`
    if (condition.op === 'gt') return sql`${field} > ${String(value ?? '')}`
    if (condition.op === 'lt') return sql`${field} < ${String(value ?? '')}`
    if (condition.op === 'between') return sql`${field} >= ${String(value ?? '')} AND ${field} <= ${String(valueTo ?? '')}`
    throw badRequest('Unsupported filter')
  }
  if (column.type === 'number' || column.type === 'currency') {
    if (condition.op === 'eq') return sql`c.value_number = ${String(value)}::numeric`
    if (condition.op === 'neq') return sql`c.value_number <> ${String(value)}::numeric`
    if (condition.op === 'gt') return sql`c.value_number > ${String(value)}::numeric`
    if (condition.op === 'lt') return sql`c.value_number < ${String(value)}::numeric`
    if (condition.op === 'between') {
      return sql`c.value_number >= ${String(value)}::numeric AND c.value_number <= ${String(valueTo)}::numeric`
    }
  }
  if (column.type === 'datetime') {
    if (condition.op === 'eq') return sql`c.value_timestamptz = ${String(value)}::timestamptz`
    if (condition.op === 'neq') return sql`c.value_timestamptz <> ${String(value)}::timestamptz`
    if (condition.op === 'gt') return sql`c.value_timestamptz > ${String(value)}::timestamptz`
    if (condition.op === 'lt') return sql`c.value_timestamptz < ${String(value)}::timestamptz`
    if (condition.op === 'between') {
      return sql`c.value_timestamptz >= ${String(value)}::timestamptz AND c.value_timestamptz <= ${String(valueTo)}::timestamptz`
    }
  }
  if (column.type === 'checkbox') {
    const flag = value === true || value === 'true' || value === '1'
    return sql`c.value_bool = ${flag}`
  }
  if (column.type === 'select' || column.type === 'radio' || column.type === 'relation') {
    const field = column.type === 'relation' ? sql`c.value_jsonb->>'rowId'` : sql`c.value_jsonb->>'optionId'`
    if (condition.op === 'eq') return sql`${field} = ${String(value ?? '')}`
    if (condition.op === 'neq') return sql`${field} <> ${String(value ?? '')}`
  }
  return text(sql`c.value_text`)
}

function compileFilter(filter: FilterNode | null | undefined, columns: Map<string, ColumnShape>): SQL {
  if (!filter) return sql`TRUE`
  if (isFilterGroup(filter)) {
    if (filter.conditions.length === 0) return sql`TRUE`
    const parts = filter.conditions.map((condition) => compileFilter(condition, columns))
    return filter.op === 'and'
      ? sql`(${sql.join(parts, sql` AND `)})`
      : sql`(${sql.join(parts, sql` OR `)})`
  }
  return compileCondition(filter, columns)
}

function keyset(cursor: Cursor | null, sort: { type: string; direction: 'asc' | 'desc' } | null): SQL {
  if (!cursor) return sql`TRUE`
  if (!sort) return sql`(r.position, r.id) > (${cursor.position}, ${cursor.id}::uuid)`
  const field = sortSql(sort.type)
  if (cursor.sortNull) {
    return sql`(${field} IS NULL AND (r.position, r.id) > (${cursor.position}, ${cursor.id}::uuid))`
  }
  const bound = bindSort(sort.type, cursor.sort ?? '')
  if (sort.direction === 'asc') {
    return sql`(${field} > ${bound} OR (${field} = ${bound} AND (r.position, r.id) > (${cursor.position}, ${cursor.id}::uuid)) OR ${field} IS NULL)`
  }
  return sql`(${field} < ${bound} OR (${field} = ${bound} AND (r.position, r.id) > (${cursor.position}, ${cursor.id}::uuid)) OR ${field} IS NULL)`
}

export async function queryRows(
  db: AppDatabase,
  input: {
    tableId: string
    columns: ColumnShape[]
    subjectType: string
    subjectId: string
    limit: number
    cursor?: string | null
    sort?: SortSpec | null
    filter?: FilterNode | null
    q?: string | null
  },
) {
  const limit = Math.min(Math.max(input.limit, 1), 100)
  const columns = new Map(input.columns.map((column) => [column.id, column]))
  const sortColumn = input.sort ? columns.get(input.sort.columnId) : undefined
  if (input.sort && !sortColumn) throw badRequest('Unknown sort column')
  const cursor = input.cursor ? decodeCursor(input.cursor) : null
  const filter = compileFilter(input.filter, columns)
  const search = input.q?.trim()
    ? sql`EXISTS (
        SELECT 1 FROM table_cells qc
        WHERE qc.row_id = r.id
          AND qc.table_id = ${input.tableId}::uuid
          AND (
            qc.value_text ILIKE ${'%' + escapeLike(searchValue(input.q)) + '%'} ESCAPE '\\'
            OR qc.value_number::text ILIKE ${'%' + escapeLike(searchValue(input.q)) + '%'} ESCAPE '\\'
          )
      )`
    : sql`TRUE`
  const denied = sql`NOT EXISTS (
    SELECT 1 FROM permission_grants g
    WHERE g.subject_type = ${input.subjectType}
      AND g.subject_id = ${input.subjectId}::uuid
      AND g.resource_type = 'row'
      AND g.resource_id = r.id
      AND g.action = 'view'
      AND g.effect = 'deny'
  )`
  const order = sortColumn
    ? sql`${sortSql(sortColumn.type)} ${sql.raw(input.sort?.direction === 'desc' ? 'DESC' : 'ASC')} NULLS LAST, r.position ASC, r.id ASC`
    : sql`r.position ASC, r.id ASC`
  const join = sortColumn
    ? sql`LEFT JOIN table_cells sc ON sc.row_id = r.id AND sc.column_id = ${sortColumn.id}::uuid`
    : sql``
  const rows = await many<{ id: string; position: string; version: number; color: string | null; notes: string | null; row_number: number | null; sort_value: string | null }>(
    db,
    sql`SELECT r.id, r.position, r.version::int AS version, r.color, r.notes, r.row_number::int AS row_number, ${sortColumn ? sortSql(sortColumn.type) : sql`NULL`} AS sort_value
        FROM table_rows r
        ${join}
        WHERE r.table_id = ${input.tableId}::uuid
          AND ${filter}
          AND ${search}
          AND ${denied}
          AND ${keyset(cursor, sortColumn ? { type: sortColumn.type, direction: input.sort?.direction ?? 'asc' } : null)}
        ORDER BY ${order}
        LIMIT ${limit + 1}`,
  )
  const page = rows.slice(0, limit)
  const extra = rows[limit]
  const last = page[page.length - 1]
  const nextCursor =
    extra && last
      ? encodeCursor({
          position: String(last.position),
          id: String(last.id),
          sort: last.sort_value == null ? null : String(last.sort_value),
          sortNull: last.sort_value == null,
        })
      : null
  return {
    rows: page.map((row) => ({
      id: String(row.id),
      position: String(row.position),
      version: Number(row.version),
      color: row.color == null ? null : String(row.color),
      notes: row.notes == null ? '' : String(row.notes),
      rowNumber: Number(row.row_number ?? 0),
    })),
    nextCursor,
  }
}

function searchValue(value: string | null | undefined) {
  return value?.trim() ?? ''
}

export async function footerFor(
  db: AppDatabase,
  input: {
    tableId: string
    column: ColumnShape
    columns: ColumnShape[]
    subjectType: string
    subjectId: string
    filter?: FilterNode | null
  },
) {
  const columns = new Map(input.columns.map((column) => [column.id, column]))
  const filter = compileFilter(input.filter, columns)
  const numeric = input.column.type === 'number' || input.column.type === 'currency'
  const field = numeric
    ? sql`c.value_number`
    : input.column.type === 'tags' || input.column.type === 'user' || input.column.type === 'status'
      ? sql`c.value_jsonb::text`
      : input.column.type === 'checkbox'
        ? sql`c.value_bool::text`
        : input.column.type === 'datetime'
          ? sql`COALESCE(c.value_timestamptz::text, c.value_text)`
          : sql`c.value_text`
  const [row] = await many<{ count: number; filled: number; sum: string | null; avg: string | null; min: string | null; max: string | null; median: string | null; unique: number }>(
    db,
    sql`SELECT
          count(*)::int AS count,
          count(${field})::int AS filled,
          ${numeric ? sql`sum(${field})` : sql`NULL`} AS sum,
          ${numeric ? sql`avg(${field})` : sql`NULL`} AS avg,
          min(${field}) AS min,
          max(${field}) AS max,
          ${numeric ? sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${field})` : sql`NULL`} AS median,
          count(DISTINCT ${field})::int AS unique
        FROM table_rows r
        LEFT JOIN table_cells c ON c.row_id = r.id AND c.column_id = ${input.column.id}::uuid
        WHERE r.table_id = ${input.tableId}::uuid
          AND ${filter}
          AND NOT EXISTS (
            SELECT 1 FROM permission_grants g
            WHERE g.subject_type = ${input.subjectType}
              AND g.subject_id = ${input.subjectId}::uuid
              AND g.resource_type = 'row'
              AND g.resource_id = r.id
              AND g.action = 'view'
              AND g.effect = 'deny'
          )`,
  )
  const count = Number(row?.count ?? 0)
  const filled = Number(row?.filled ?? 0)
  return {
    count,
    filled,
    empty: count - filled,
    unique: Number(row?.unique ?? 0),
    sum: row?.sum == null ? null : Number(row.sum),
    avg: row?.avg == null ? null : Number(row.avg),
    median: row?.median == null ? null : Number(row.median),
    min: row?.min == null ? null : numeric ? Number(row.min) : row.min,
    max: row?.max == null ? null : numeric ? Number(row.max) : row.max,
  }
}
