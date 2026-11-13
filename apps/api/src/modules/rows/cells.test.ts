import { generateKeyBetween } from 'fractional-indexing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testEnv } from '../../config/env.js'
import { createDatabase, type AppDatabase } from '../../database/client.js'
import { organizations, projects, tableCells, tableColumns, tableRows, tables, users } from '../../database/schema.js'
import { hashPassword } from '../../security/passwords.js'
import { persistCell } from './cells.js'

let db: AppDatabase
let close: () => Promise<void>
let tableId = ''
let columnId = ''
let rowId = ''

const parsed = {
  valueText: 'Ada',
  valueNumber: null,
  valueBool: null,
  valueTimestamptz: null,
  valueJsonb: null,
}

async function seed() {
  const env = testEnv()
  const handle = await createDatabase(env)
  db = handle.db
  close = handle.close
  const [org] = await db.insert(organizations).values({ name: 'Default' }).returning()
  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      username: 'cell-writer',
      email: 'cell-writer@example.com',
      passwordHash: await hashPassword('correct horse battery', env),
      role: 'user',
    })
    .returning()
  const [project] = await db
    .insert(projects)
    .values({ organizationId: org.id, name: 'Cells', createdBy: user.id })
    .returning()
  const [table] = await db
    .insert(tables)
    .values({ projectId: project.id, name: 'People', createdBy: user.id })
    .returning()
  tableId = table.id
  const [column] = await db
    .insert(tableColumns)
    .values({ tableId, name: 'Name', type: 'text', position: generateKeyBetween(null, null) })
    .returning()
  columnId = column.id
  const [row] = await db
    .insert(tableRows)
    .values({ tableId, position: generateKeyBetween(null, null), createdBy: user.id })
    .returning()
  rowId = row.id
}

async function storedCell() {
  const [cell] = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, columnId)))
    .limit(1)
  return cell
}

describe('persistCell', () => {
  beforeAll(async () => {
    await seed()
  })

  afterAll(async () => {
    await close?.()
  })

  it('upserts in place and keeps the cell id', async () => {
    await persistCell(db, {
      tableId,
      rowId,
      columnId,
      parsed,
      background: 'amber',
      formatRules: [{ op: 'eq' }],
      mode: 'upsert',
    })
    const created = await storedCell()
    expect(created?.valueText).toBe('Ada')
    expect(created?.background).toBe('amber')
    expect(created?.formatRules).toEqual([{ op: 'eq' }])

    await persistCell(db, {
      tableId,
      rowId,
      columnId,
      parsed: { ...parsed, valueText: 'Grace' },
      background: 'amber',
      formatRules: [{ op: 'eq' }],
      mode: 'upsert',
    })
    const updated = await storedCell()
    expect(updated?.id).toBe(created?.id)
    expect(updated?.valueText).toBe('Grace')
    expect(updated?.createdAt).toEqual(created?.createdAt)
  })

  it('replaces the cell row so a later write can drop rules the caller no longer wants', async () => {
    await persistCell(db, {
      tableId,
      rowId,
      columnId,
      parsed,
      background: 'amber',
      formatRules: [{ op: 'eq' }],
      mode: 'upsert',
    })
    const previous = await storedCell()
    await persistCell(db, {
      tableId,
      rowId,
      columnId,
      parsed: { ...parsed, valueText: 'Grace' },
      background: null,
      formatRules: [],
      mode: 'replace',
    })
    const replaced = await storedCell()
    expect(replaced?.id).not.toBe(previous?.id)
    expect(replaced?.valueText).toBe('Grace')
    expect(replaced?.background).toBeNull()
    expect(replaced?.formatRules).toEqual([])
  })

  it('stores a background with no parsed value, leaving empty-cell deletion to the caller', async () => {
    await persistCell(db, {
      tableId,
      rowId,
      columnId,
      parsed: null,
      background: 'blue',
      formatRules: [],
      mode: 'upsert',
    })
    const cell = await storedCell()
    expect(cell?.valueText).toBeNull()
    expect(cell?.background).toBe('blue')
  })
})
