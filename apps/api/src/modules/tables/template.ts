import { generateKeyBetween } from 'fractional-indexing'
import type { AppDatabase } from '../../database/client.js'
import { columnOptions, tableColumns, tables } from '../../database/schema.js'

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
