import { generateKeyBetween } from 'fractional-indexing'
import type { AppDatabase } from '../../database/client.js'
import { columnOptions, tableCells, tableColumns, tableRows, tables } from '../../database/schema.js'

export async function seedStarter(db: AppDatabase, projectId: string, userId: string) {
  const [table] = await db.insert(tables).values({ projectId, name: 'People', description: '', createdBy: userId }).returning()
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
    .values({ tableId: table.id, position: generateKeyBetween(null, null), createdBy: userId })
    .returning()
  await db.insert(tableCells).values([
    { tableId: table.id, rowId: row.id, columnId: nameColumn.id, valueText: 'John Doe' },
    { tableId: table.id, rowId: row.id, columnId: mailColumn.id, valueText: 'john@doe.com' },
  ])
  return table.id
}

export async function seedCustomers(db: AppDatabase, projectId: string, userId: string) {
  const [table] = await db
    .insert(tables)
    .values({ projectId, name: 'Customers', description: 'Starter customer list', createdBy: userId })
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
