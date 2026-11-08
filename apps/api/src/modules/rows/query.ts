import { dateColumnIncludesTime, escapeLike, isChartDimensionType, isFilterGroup, selectColumnMultiple, type FilterCondition, type FilterNode } from '@datavalley/shared'
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

function dateSortField(column: ColumnShape): SQL {
  if (column.config.range) return sql`sc.value_jsonb->>'from'`
  if (dateColumnIncludesTime(column)) return sql`COALESCE(sc.value_timestamptz::text, sc.value_text)`
  return sql`sc.value_text`
}

function sortSql(column: ColumnShape): SQL {
  if (column.type === 'number' || column.type === 'currency') return sql`sc.value_number`
  if (column.type === 'datetime' || column.type === 'date') return dateSortField(column)
  if (column.type === 'checkbox') return sql`sc.value_bool::text`
  if (column.type === 'select' || column.type === 'radio') {
    if (selectColumnMultiple(column)) return sql`sc.value_jsonb->'optionIds'->>0`
    return sql`sc.value_jsonb->>'optionId'`
  }
  return sql`sc.value_text`
}

function bindSort(column: ColumnShape, value: string): SQL {
  if (column.type === 'number' || column.type === 'currency') return sql`${value}::numeric`
  if (dateColumnIncludesTime(column) && !column.config.range) return sql`${value}::timestamptz`
  return sql`${value}`
}

function compileCondition(condition: FilterCondition, columns: Map<string, ColumnShape>): SQL | null {
  const column = columns.get(condition.columnId)
  if (!column) return null
  if (!operatorsFor(column.type).includes(condition.op)) return null
  const id = column.id
  if (condition.op === 'empty') {
    return sql`NOT EXISTS (SELECT 1 FROM table_cells c WHERE c.row_id = r.id AND c.column_id = ${id}::uuid)`
  }
  if (condition.op === 'not_empty') {
    return sql`EXISTS (SELECT 1 FROM table_cells c WHERE c.row_id = r.id AND c.column_id = ${id}::uuid)`
  }
  const predicate = comparison(column, condition)
  if (!predicate) return null
  return sql`EXISTS (SELECT 1 FROM table_cells c WHERE c.row_id = r.id AND c.column_id = ${id}::uuid AND ${predicate})`
}

function comparison(column: ColumnShape, condition: FilterCondition): SQL | null {
  const value = condition.value
  const valueTo = condition.valueTo
  const text = (field: SQL): SQL | null => {
    if (condition.op === 'eq') return sql`${field} = ${String(value ?? '')}`
    if (condition.op === 'neq') return sql`${field} <> ${String(value ?? '')}`
    if (condition.op === 'contains') return sql`${field} ILIKE ${'%' + escapeLike(String(value ?? '')) + '%'} ESCAPE '\\'`
    if (condition.op === 'not_contains') return sql`${field} NOT ILIKE ${'%' + escapeLike(String(value ?? '')) + '%'} ESCAPE '\\'`
    if (condition.op === 'starts_with') return sql`${field} ILIKE ${escapeLike(String(value ?? '')) + '%'} ESCAPE '\\'`
    if (condition.op === 'ends_with') return sql`${field} ILIKE ${'%' + escapeLike(String(value ?? ''))} ESCAPE '\\'`
    if (condition.op === 'gt') return sql`${field} > ${String(value ?? '')}`
    if (condition.op === 'lt') return sql`${field} < ${String(value ?? '')}`
    if (condition.op === 'between') return sql`${field} >= ${String(value ?? '')} AND ${field} <= ${String(valueTo ?? '')}`
    return null
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
  if (column.type === 'date' || column.type === 'datetime') {
    const field = column.config.range
      ? sql`c.value_jsonb->>'from'`
      : dateColumnIncludesTime(column)
        ? sql`COALESCE(c.value_timestamptz::text, c.value_text)`
        : sql`c.value_text`
    if (condition.op === 'eq') return sql`${field} = ${String(value ?? '')}`
    if (condition.op === 'neq') return sql`${field} <> ${String(value ?? '')}`
    if (condition.op === 'gt') return sql`${field} > ${String(value ?? '')}`
    if (condition.op === 'lt') return sql`${field} < ${String(value ?? '')}`
    if (condition.op === 'between') {
      return sql`${field} >= ${String(value ?? '')} AND ${field} <= ${String(valueTo ?? '')}`
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

function compileNode(filter: FilterNode, columns: Map<string, ColumnShape>): SQL | null {
  if (isFilterGroup(filter)) {
    const parts = filter.conditions.flatMap((condition) => {
      const compiled = compileNode(condition, columns)
      return compiled ? [compiled] : []
    })
    if (parts.length === 0) return null
    return filter.op === 'and'
      ? sql`(${sql.join(parts, sql` AND `)})`
      : sql`(${sql.join(parts, sql` OR `)})`
  }
  return compileCondition(filter, columns)
}

function compileFilter(filter: FilterNode | null | undefined, columns: Map<string, ColumnShape>): SQL {
  if (!filter) return sql`TRUE`
  return compileNode(filter, columns) ?? sql`TRUE`
}

function keyset(cursor: Cursor | null, sort: { column: ColumnShape; direction: 'asc' | 'desc' } | null): SQL {
  if (!cursor) return sql`TRUE`
  if (!sort) return sql`(r.position, r.id) > (${cursor.position}, ${cursor.id}::uuid)`
  const field = sortSql(sort.column)
  if (cursor.sortNull) {
    return sql`(${field} IS NULL AND (r.position, r.id) > (${cursor.position}, ${cursor.id}::uuid))`
  }
  const bound = bindSort(sort.column, cursor.sort ?? '')
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
  const denied = rowViewDenied(input.subjectType, input.subjectId)
  const order = sortColumn
    ? sql`${sortSql(sortColumn)} ${sql.raw(input.sort?.direction === 'desc' ? 'DESC' : 'ASC')} NULLS LAST, r.position ASC, r.id ASC`
    : sql`r.position ASC, r.id ASC`
  const join = sortColumn
    ? sql`LEFT JOIN table_cells sc ON sc.row_id = r.id AND sc.column_id = ${sortColumn.id}::uuid`
    : sql``
  const rows = await many<{ id: string; position: string; version: number; color: string | null; row_number: number | null; sort_value: string | null }>(
    db,
    sql`SELECT r.id, r.position, r.version::int AS version, r.color, r.row_number::int AS row_number, ${sortColumn ? sortSql(sortColumn) : sql`NULL`} AS sort_value
        FROM table_rows r
        ${join}
        WHERE r.table_id = ${input.tableId}::uuid
          AND ${filter}
          AND ${search}
          AND ${denied}
          AND ${keyset(cursor, sortColumn ? { column: sortColumn, direction: input.sort?.direction ?? 'asc' } : null)}
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
      notes: '',
      rowNumber: Number(row.row_number ?? 0),
    })),
    nextCursor,
  }
}

function searchValue(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function rowViewDenied(subjectType: string, subjectId: string): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM permission_grants g
    WHERE g.subject_type = ${subjectType}
      AND g.subject_id = ${subjectId}::uuid
      AND g.resource_type = 'row'
      AND g.resource_id = r.id
      AND g.action = 'view'
      AND g.effect = 'deny'
  )`
}

type FooterStatRow = {
  column_id: string
  count: number | string
  num_filled: number | string | null
  num_sum: number | string | null
  num_avg: number | string | null
  num_min: number | string | null
  num_max: number | string | null
  num_median: number | string | null
  num_unique: number | string | null
  bool_filled: number | string | null
  bool_unique: number | string | null
  bool_min: string | null
  bool_max: string | null
  text_filled: number | string | null
  text_unique: number | string | null
  text_min: string | null
  text_max: string | null
  json_filled: number | string | null
  json_unique: number | string | null
  json_min: string | null
  json_max: string | null
  range_filled: number | string | null
  range_unique: number | string | null
  range_min: string | null
  range_max: string | null
  datetime_filled: number | string | null
  datetime_unique: number | string | null
  datetime_min: string | null
  datetime_max: string | null
}

function uuidList(ids: string[]) {
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]`
}

function footerKind(column: ColumnShape) {
  if (column.type === 'number' || column.type === 'currency') return 'num' as const
  if (column.type === 'checkbox') return 'bool' as const
  if (column.type === 'tags' || column.type === 'user' || column.type === 'status') return 'json' as const
  if ((column.type === 'date' || column.type === 'datetime') && column.config.range) return 'range' as const
  if ((column.type === 'date' || column.type === 'datetime') && dateColumnIncludesTime(column)) return 'datetime' as const
  return 'text' as const
}

function footerColumnStats(column: ColumnShape, row: FooterStatRow | undefined, count: number) {
  const kind = footerKind(column)
  const filled = Number(
    (kind === 'num' ? row?.num_filled : kind === 'bool' ? row?.bool_filled : kind === 'json' ? row?.json_filled : kind === 'range' ? row?.range_filled : kind === 'datetime' ? row?.datetime_filled : row?.text_filled) ?? 0,
  )
  const unique = Number(
    (kind === 'num' ? row?.num_unique : kind === 'bool' ? row?.bool_unique : kind === 'json' ? row?.json_unique : kind === 'range' ? row?.range_unique : kind === 'datetime' ? row?.datetime_unique : row?.text_unique) ?? 0,
  )
  const min = kind === 'num' ? row?.num_min : kind === 'bool' ? row?.bool_min : kind === 'json' ? row?.json_min : kind === 'range' ? row?.range_min : kind === 'datetime' ? row?.datetime_min : row?.text_min
  const max = kind === 'num' ? row?.num_max : kind === 'bool' ? row?.bool_max : kind === 'json' ? row?.json_max : kind === 'range' ? row?.range_max : kind === 'datetime' ? row?.datetime_max : row?.text_max
  const numeric = kind === 'num'
  return {
    count,
    filled,
    empty: count - filled,
    unique,
    sum: numeric && row?.num_sum != null ? Number(row.num_sum) : null,
    avg: numeric && row?.num_avg != null ? Number(row.num_avg) : null,
    median: numeric && row?.num_median != null ? Number(row.num_median) : null,
    min: min == null ? null : numeric ? Number(min) : min,
    max: max == null ? null : numeric ? Number(max) : max,
  }
}

export async function footerColumns(
  db: AppDatabase,
  input: {
    tableId: string
    columns: ColumnShape[]
    catalog: ColumnShape[]
    subjectType: string
    subjectId: string
    filter?: FilterNode | null
  },
) {
  const result: Record<string, ReturnType<typeof footerColumnStats>> = {}
  if (input.columns.length === 0) return result
  const catalog = new Map(input.catalog.map((column) => [column.id, column]))
  const filter = compileFilter(input.filter, catalog)
  const denied = rowViewDenied(input.subjectType, input.subjectId)
  const ids = uuidList(input.columns.map((column) => column.id))
  const rows = await many<FooterStatRow>(
    db,
    sql`WITH filtered AS (
          SELECT r.id
          FROM table_rows r
          WHERE r.table_id = ${input.tableId}::uuid
            AND ${filter}
            AND ${denied}
        ),
        cols AS (
          SELECT u.column_id FROM unnest(${ids}) AS u(column_id)
        ),
        stats AS (
          SELECT
            c.column_id,
            count(c.value_number)::int AS num_filled,
            sum(c.value_number) AS num_sum,
            avg(c.value_number) AS num_avg,
            min(c.value_number) AS num_min,
            max(c.value_number) AS num_max,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY c.value_number) AS num_median,
            count(DISTINCT c.value_number)::int AS num_unique,
            count(c.value_bool)::int AS bool_filled,
            count(DISTINCT c.value_bool::text)::int AS bool_unique,
            min(c.value_bool::text) AS bool_min,
            max(c.value_bool::text) AS bool_max,
            count(c.value_text)::int AS text_filled,
            count(DISTINCT c.value_text)::int AS text_unique,
            min(c.value_text) AS text_min,
            max(c.value_text) AS text_max,
            count(c.value_jsonb)::int AS json_filled,
            count(DISTINCT c.value_jsonb::text)::int AS json_unique,
            min(c.value_jsonb::text) AS json_min,
            max(c.value_jsonb::text) AS json_max,
            count(c.value_jsonb->>'from')::int AS range_filled,
            count(DISTINCT c.value_jsonb->>'from')::int AS range_unique,
            min(c.value_jsonb->>'from') AS range_min,
            max(c.value_jsonb->>'from') AS range_max,
            count(COALESCE(c.value_timestamptz::text, c.value_text))::int AS datetime_filled,
            count(DISTINCT COALESCE(c.value_timestamptz::text, c.value_text))::int AS datetime_unique,
            min(COALESCE(c.value_timestamptz::text, c.value_text)) AS datetime_min,
            max(COALESCE(c.value_timestamptz::text, c.value_text)) AS datetime_max
          FROM filtered f
          INNER JOIN table_cells c ON c.row_id = f.id AND c.column_id IN (SELECT column_id FROM cols)
          GROUP BY c.column_id
        )
        SELECT
          cols.column_id,
          rc.count,
          stats.num_filled, stats.num_sum, stats.num_avg, stats.num_min, stats.num_max, stats.num_median, stats.num_unique,
          stats.bool_filled, stats.bool_unique, stats.bool_min, stats.bool_max,
          stats.text_filled, stats.text_unique, stats.text_min, stats.text_max,
          stats.json_filled, stats.json_unique, stats.json_min, stats.json_max,
          stats.range_filled, stats.range_unique, stats.range_min, stats.range_max,
          stats.datetime_filled, stats.datetime_unique, stats.datetime_min, stats.datetime_max
        FROM cols
        CROSS JOIN (SELECT count(*)::int AS count FROM filtered) rc
        LEFT JOIN stats ON stats.column_id = cols.column_id`,
  )
  const byId = new Map(rows.map((row) => [String(row.column_id), row]))
  const count = Number(rows[0]?.count ?? 0)
  for (const column of input.columns) result[column.id] = footerColumnStats(column, byId.get(column.id), count)
  return result
}

function dimensionFrom(column: ColumnShape): { from: SQL; key: SQL } {
  const cell = sql`LEFT JOIN table_cells dim ON dim.row_id = f.id AND dim.column_id = ${column.id}::uuid`
  if (column.type === 'tags') {
    return {
      from: sql`${cell} LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(dim.value_jsonb->'tagIds', '[]'::jsonb)) AS dim_key(k) ON TRUE`,
      key: sql`COALESCE(dim_key.k, '')`,
    }
  }
  if (selectColumnMultiple(column)) {
    return {
      from: sql`${cell} LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(dim.value_jsonb->'optionIds', '[]'::jsonb)) AS dim_key(k) ON TRUE`,
      key: sql`COALESCE(dim_key.k, '')`,
    }
  }
  if (column.type === 'status') return { from: cell, key: sql`COALESCE(dim.value_jsonb->>'statusId', '')` }
  if (column.type === 'select' || column.type === 'radio') return { from: cell, key: sql`COALESCE(dim.value_jsonb->>'optionId', '')` }
  return { from: cell, key: sql`COALESCE(NULLIF(btrim(dim.value_text), ''), '')` }
}

export async function groupSummary(
  db: AppDatabase,
  input: {
    tableId: string
    dimension: ColumnShape
    values: ColumnShape[]
    columns: ColumnShape[]
    subjectType: string
    subjectId: string
    filter?: FilterNode | null
  },
) {
  if (!isChartDimensionType(input.dimension.type)) throw badRequest('That column cannot group a chart')
  const catalog = new Map(input.columns.map((column) => [column.id, column]))
  const filter = compileFilter(input.filter, catalog)
  const denied = rowViewDenied(input.subjectType, input.subjectId)
  const dimension = dimensionFrom(input.dimension)
  const values = input.values.filter((column) => column.type === 'number' || column.type === 'currency').slice(0, 12)
  const joins = values.length
    ? sql.join(
        values.map((column, index) => {
          const alias = sql.raw(`v${index}`)
          return sql`LEFT JOIN table_cells ${alias} ON ${alias}.row_id = f.id AND ${alias}.column_id = ${column.id}::uuid`
        }),
        sql` `,
      )
    : sql``
  const sums = values.length
    ? sql`, ${sql.join(
        values.map((_, index) => {
          const alias = sql.raw(`v${index}`)
          return sql`coalesce(sum(${alias}.value_number), 0) AS ${sql.raw(`sum_${index}`)}`
        }),
        sql`, `,
      )}`
    : sql``
  const rows = await many<Record<string, unknown>>(
    db,
    sql`WITH filtered AS (
          SELECT r.id
          FROM table_rows r
          WHERE r.table_id = ${input.tableId}::uuid
            AND ${filter}
            AND ${denied}
        )
        SELECT ${dimension.key} AS key, count(*)::int AS count ${sums}
        FROM filtered f
        ${dimension.from}
        ${joins}
        GROUP BY 1`,
  )
  return rows.map((row) => ({
    key: row.key == null ? '' : String(row.key),
    count: Number(row.count ?? 0),
    sums: Object.fromEntries(values.map((column, index) => [column.id, Number(row[`sum_${index}`] ?? 0)])),
  }))
}
