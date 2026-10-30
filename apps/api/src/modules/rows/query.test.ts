import { generateKeyBetween } from 'fractional-indexing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testEnv } from '../../config/env.js'
import { createDatabase, type AppDatabase } from '../../database/client.js'
import { organizations, permissionGrants, projects, tableCells, tableColumns, tableRows, tables, users } from '../../database/schema.js'
import { hashPassword } from '../../security/passwords.js'
import { queryRows } from './query.js'

let db: AppDatabase
let close: () => Promise<void>
let tableId = ''
let numberId = ''
let textId = ''
let subjectId = ''

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
      username: 'ada',
      email: 'ada@example.com',
      passwordHash: await hashPassword('correct horse battery', env),
      role: 'user',
    })
    .returning()
  subjectId = user.id
  const [project] = await db
    .insert(projects)
    .values({ organizationId: org.id, name: 'CRM', createdBy: user.id })
    .returning()
  await db.insert(permissionGrants).values({
    subjectType: 'user',
    subjectId: user.id,
    resourceType: 'project',
    resourceId: project.id,
    action: 'view',
    effect: 'allow',
  })
  const [table] = await db.insert(tables).values({ projectId: project.id, name: 'Customers', createdBy: user.id }).returning()
  tableId = table.id
  const [nameColumn] = await db
    .insert(tableColumns)
    .values({ tableId, name: 'Name', type: 'text', position: generateKeyBetween(null, null) })
    .returning()
  const [amountColumn] = await db
    .insert(tableColumns)
    .values({ tableId, name: 'Amount', type: 'number', position: generateKeyBetween(nameColumn.position, null) })
    .returning()
  textId = nameColumn.id
  numberId = amountColumn.id
  let previous: string | null = null
  for (const [index, amount] of [10, 30, 20].entries()) {
    previous = generateKeyBetween(previous, null)
    const [row] = await db.insert(tableRows).values({ tableId, position: previous, createdBy: user.id }).returning()
    await db.insert(tableCells).values([
      { tableId, rowId: row.id, columnId: textId, valueText: `Name ${index}` },
      { tableId, rowId: row.id, columnId: numberId, valueNumber: amount.toFixed(4) },
    ])
  }
}

describe('row query', () => {
  beforeAll(async () => {
    await seed()
  })

  afterAll(async () => {
    await close?.()
  })

  it('filters, sorts, and paginates without loading every row into one page', async () => {
    const columns = [
      { id: textId, name: 'Name', type: 'text', config: {} },
      { id: numberId, name: 'Amount', type: 'number', config: {} },
    ]
    const first = await queryRows(db, {
      tableId,
      columns,
      subjectType: 'user',
      subjectId,
      limit: 1,
      sort: { columnId: numberId, direction: 'asc' },
      filter: { op: 'gt', columnId: numberId, value: 10 },
    })
    expect(first.rows).toHaveLength(1)
    expect(first.nextCursor).toBeTruthy()
    const second = await queryRows(db, {
      tableId,
      columns,
      subjectType: 'user',
      subjectId,
      limit: 1,
      cursor: first.nextCursor,
      sort: { columnId: numberId, direction: 'asc' },
      filter: { op: 'gt', columnId: numberId, value: 10 },
    })
    expect(second.rows).toHaveLength(1)
    expect(second.rows[0].id).not.toBe(first.rows[0].id)
    const names = await queryRows(db, {
      tableId,
      columns,
      subjectType: 'user',
      subjectId,
      limit: 10,
      q: 'Name 1',
    })
    expect(names.rows).toHaveLength(1)
    const stored = await db.select().from(tableRows).where(eq(tableRows.tableId, tableId))
    expect(stored).toHaveLength(3)
  })

  it('skips filters the query cannot apply and keeps the rest', async () => {
    const formulaId = '00000000-0000-4000-8000-000000000001'
    const columns = [
      { id: textId, name: 'Name', type: 'text', config: {} },
      { id: numberId, name: 'Amount', type: 'number', config: {} },
      { id: formulaId, name: 'Total', type: 'formula', config: {} },
    ]
    const base = { tableId, columns, subjectType: 'user' as const, subjectId, limit: 10 }
    const skipped = await queryRows(db, {
      ...base,
      filter: { op: 'contains', columnId: formulaId, value: 'nope' },
    })
    expect(skipped.rows).toHaveLength(3)
    const mixed = await queryRows(db, {
      ...base,
      filter: {
        op: 'and',
        conditions: [
          { op: 'contains', columnId: formulaId, value: 'nope' },
          { op: 'eq', columnId: textId, value: 'Name 1' },
        ],
      },
    })
    expect(mixed.rows).toHaveLength(1)
    const unknown = await queryRows(db, {
      ...base,
      filter: { op: 'eq', columnId: '00000000-0000-4000-8000-000000000099', value: 'Name 0' },
    })
    expect(unknown.rows).toHaveLength(3)
  })
})
