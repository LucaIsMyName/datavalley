import { eq } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { AppDatabase } from '../../database/client.js'
import { columnOptions, tableCells, tableColumns, tableRows, tables } from '../../database/schema.js'

async function nextPosition(db: AppDatabase, projectId: string) {
  const existing = await db
    .select({ position: tables.position })
    .from(tables)
    .where(eq(tables.projectId, projectId))
  const last = existing.map((row) => row.position).sort().at(-1) ?? null
  return generateKeyBetween(last, null)
}

export async function seedStarter(db: AppDatabase, projectId: string, userId: string) {
  const [table] = await db
    .insert(tables)
    .values({ projectId, name: 'People', description: '', position: await nextPosition(db, projectId), createdBy: userId })
    .returning()
  const namePos = generateKeyBetween(null, null)
  const mailPos = generateKeyBetween(namePos, null)
  const [nameColumn] = await db
    .insert(tableColumns)
    .values({ tableId: table.id, name: 'Name', type: 'text', position: namePos })
    .returning()
  const [mailColumn] = await db
    .insert(tableColumns)
    .values({ tableId: table.id, name: 'Mail', type: 'mail', position: mailPos })
    .returning()
  const [row] = await db
    .insert(tableRows)
    .values({ tableId: table.id, position: generateKeyBetween(null, null), rowNumber: 1, createdBy: userId })
    .returning()
  await db.update(tables).set({ nextRowNumber: 2 }).where(eq(tables.id, table.id))
  await db.insert(tableCells).values([
    { tableId: table.id, rowId: row.id, columnId: nameColumn.id, valueText: 'John Doe' },
    { tableId: table.id, rowId: row.id, columnId: mailColumn.id, valueText: 'john@doe.com' },
  ])
  return table.id
}

export async function seedCustomers(db: AppDatabase, projectId: string, userId: string) {
  const [table] = await db
    .insert(tables)
    .values({
      projectId,
      name: 'Customers',
      description: 'Starter customer list',
      position: await nextPosition(db, projectId),
      createdBy: userId,
    })
    .returning()
  const namePos = generateKeyBetween(null, null)
  const emailPos = generateKeyBetween(namePos, null)
  const statusPos = generateKeyBetween(emailPos, null)
  await db.insert(tableColumns).values([
    { tableId: table.id, name: 'Name', type: 'text', position: namePos },
    { tableId: table.id, name: 'Email', type: 'text', position: emailPos },
  ])
  const [status] = await db
    .insert(tableColumns)
    .values({ tableId: table.id, name: 'Status', type: 'select', position: statusPos })
    .returning()
  let optionPos: string | null = null
  for (const label of ['New', 'Active', 'Inactive']) {
    optionPos = generateKeyBetween(optionPos, null)
    await db.insert(columnOptions).values({ columnId: status.id, label, position: optionPos, color: null })
  }
  return table.id
}

const demoRows = [
  ['Ada Lovelace', 'ada@example.com', 'Analytical Engines', 'First programmer'],
  ['Alan Turing', 'alan@example.com', 'Bletchley Park', 'Computing pioneer'],
  ['Grace Hopper', 'grace@example.com', 'Navy', 'COBOL'],
]

export async function seedDemoTable(db: AppDatabase, tableId: string, userId: string) {
  let columnPos: string | null = null
  const columns = []
  for (const name of ['Name', 'Email', 'Company', 'Notes']) {
    columnPos = generateKeyBetween(columnPos, null)
    const [column] = await db.insert(tableColumns).values({ tableId, name, type: 'text', position: columnPos }).returning()
    columns.push(column)
  }
  let rowPos: string | null = null
  let rowNumber = 1
  for (const record of demoRows) {
    rowPos = generateKeyBetween(rowPos, null)
    const [row] = await db
      .insert(tableRows)
      .values({ tableId, position: rowPos, rowNumber, createdBy: userId })
      .returning()
    await db.insert(tableCells).values(
      columns.map((column, index) => ({
        tableId,
        rowId: row.id,
        columnId: column.id,
        valueText: record[index] ?? '',
      })),
    )
    rowNumber += 1
  }
  await db.update(tables).set({ nextRowNumber: rowNumber }).where(eq(tables.id, tableId))
}
