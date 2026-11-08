import { eq } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { AppDatabase } from '../../database/client.js'
import { columnOptions, relationRecords, relations, tableCells, tableColumns, tableRows, tableViews, tables } from '../../database/schema.js'
import { defaultColumnIcon } from '../../column-types/index.js'

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

async function insertTable(db: AppDatabase, projectId: string, userId: string, name: string, description: string) {
  const [table] = await db
    .insert(tables)
    .values({
      projectId,
      name,
      description,
      position: await nextPosition(db, projectId),
      createdBy: userId,
    })
    .returning()
  return table
}

async function insertColumn(
  db: AppDatabase,
  tableId: string,
  position: string | null,
  input: {
    name: string
    type: string
    config?: Record<string, unknown>
    options?: { label: string; color: string }[]
  },
) {
  const next = generateKeyBetween(position, null)
  const [column] = await db
    .insert(tableColumns)
    .values({
      tableId,
      name: input.name,
      type: input.type,
      position: next,
      config: { icon: defaultColumnIcon(input.type), ...(input.config ?? {}) },
    })
    .returning()
  let optionPos: string | null = null
  for (const option of input.options ?? []) {
    optionPos = generateKeyBetween(optionPos, null)
    await db.insert(columnOptions).values({
      columnId: column.id,
      label: option.label,
      color: option.color,
      position: optionPos,
    })
  }
  return { column, position: next }
}

async function relate(
  db: AppDatabase,
  fromTableId: string,
  toTableId: string,
  columnId: string,
) {
  const [relation] = await db
    .insert(relations)
    .values({
      fromTableId,
      toTableId,
      fromColumnId: columnId,
      cardinality: 'many_to_one',
      onDelete: 'restrict',
    })
    .returning()
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  const config = { ...(column.config as Record<string, unknown>), relationId: relation.id, toTableId }
  await db.update(tableColumns).set({ config }).where(eq(tableColumns.id, columnId))
  return relation.id
}

async function insertRow(
  db: AppDatabase,
  tableId: string,
  userId: string,
  position: string | null,
  rowNumber: number,
) {
  const next = generateKeyBetween(position, null)
  const [row] = await db
    .insert(tableRows)
    .values({ tableId, position: next, rowNumber, createdBy: userId })
    .returning()
  await db.update(tables).set({ nextRowNumber: rowNumber + 1 }).where(eq(tables.id, tableId))
  return { row, position: next }
}

export async function seedCrm(db: AppDatabase, projectId: string, userId: string) {
  const companies = await insertTable(db, projectId, userId, 'Companies', 'Accounts you sell to')
  const people = await insertTable(db, projectId, userId, 'People', 'Contacts at those companies')
  const deals = await insertTable(db, projectId, userId, 'Deals', 'Pipeline of opportunities')

  let companyPos: string | null = null
  const companyName = await insertColumn(db, companies.id, companyPos, { name: 'Name', type: 'text' })
  companyPos = companyName.position
  const companyDomain = await insertColumn(db, companies.id, companyPos, { name: 'Domain', type: 'url' })

  let personPos: string | null = null
  const personName = await insertColumn(db, people.id, personPos, { name: 'Name', type: 'text' })
  personPos = personName.position
  const personMail = await insertColumn(db, people.id, personPos, { name: 'Email', type: 'mail' })
  personPos = personMail.position
  const personCompany = await insertColumn(db, people.id, personPos, { name: 'Company', type: 'relation' })
  const personRelation = await relate(db, people.id, companies.id, personCompany.column.id)

  let dealPos: string | null = null
  const dealName = await insertColumn(db, deals.id, dealPos, { name: 'Name', type: 'text' })
  dealPos = dealName.position
  const stage = await insertColumn(db, deals.id, dealPos, {
    name: 'Stage',
    type: 'select',
    options: [
      { label: 'New', color: 'slate' },
      { label: 'Qualified', color: 'blue' },
      { label: 'Proposal', color: 'amber' },
      { label: 'Won', color: 'green' },
      { label: 'Lost', color: 'red' },
    ],
  })
  dealPos = stage.position
  const amount = await insertColumn(db, deals.id, dealPos, {
    name: 'Amount',
    type: 'number',
    config: { icon: 'Coins', variant: 'money', currency: 'EUR' },
  })
  dealPos = amount.position
  const closeDate = await insertColumn(db, deals.id, dealPos, { name: 'Close date', type: 'date' })
  dealPos = closeDate.position
  const owner = await insertColumn(db, deals.id, dealPos, { name: 'Owner', type: 'user' })
  dealPos = owner.position
  const dealCompany = await insertColumn(db, deals.id, dealPos, { name: 'Company', type: 'relation' })
  dealPos = dealCompany.position
  const dealRelation = await relate(db, deals.id, companies.id, dealCompany.column.id)
  const dealPerson = await insertColumn(db, deals.id, dealPos, { name: 'Person', type: 'relation' })
  const personDealRelation = await relate(db, deals.id, people.id, dealPerson.column.id)

  const companyRow = await insertRow(db, companies.id, userId, null, 1)
  await db.insert(tableCells).values([
    { tableId: companies.id, rowId: companyRow.row.id, columnId: companyName.column.id, valueText: 'Northwind' },
    { tableId: companies.id, rowId: companyRow.row.id, columnId: companyDomain.column.id, valueText: 'https://northwind.example' },
  ])
  const personRow = await insertRow(db, people.id, userId, null, 1)
  await db.insert(tableCells).values([
    { tableId: people.id, rowId: personRow.row.id, columnId: personName.column.id, valueText: 'Ada Lovelace' },
    { tableId: people.id, rowId: personRow.row.id, columnId: personMail.column.id, valueText: 'ada@northwind.example' },
    {
      tableId: people.id,
      rowId: personRow.row.id,
      columnId: personCompany.column.id,
      valueJsonb: { rowId: companyRow.row.id },
    },
  ])
  await db.insert(relationRecords).values({
    relationId: personRelation,
    fromRowId: personRow.row.id,
    toRowId: companyRow.row.id,
  })
  const stageOptions = await db.select().from(columnOptions).where(eq(columnOptions.columnId, stage.column.id))
  const qualified = stageOptions.find((option) => option.label === 'Qualified')
  const dealRow = await insertRow(db, deals.id, userId, null, 1)
  await db.insert(tableCells).values([
    { tableId: deals.id, rowId: dealRow.row.id, columnId: dealName.column.id, valueText: 'Website' },
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: stage.column.id,
      valueJsonb: { optionId: qualified?.id ?? null },
    },
    { tableId: deals.id, rowId: dealRow.row.id, columnId: amount.column.id, valueNumber: '12000' },
    { tableId: deals.id, rowId: dealRow.row.id, columnId: closeDate.column.id, valueText: '2026-12-01' },
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: owner.column.id,
      valueJsonb: { userIds: [userId] },
    },
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: dealCompany.column.id,
      valueJsonb: { rowId: companyRow.row.id },
    },
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: dealPerson.column.id,
      valueJsonb: { rowId: personRow.row.id },
    },
  ])
  await db.insert(relationRecords).values([
    { relationId: dealRelation, fromRowId: dealRow.row.id, toRowId: companyRow.row.id },
    { relationId: personDealRelation, fromRowId: dealRow.row.id, toRowId: personRow.row.id },
  ])

  const tasks = await insertTable(db, projectId, userId, 'Tasks', 'Follow-ups on deals and people')
  let taskPos: string | null = null
  const taskName = await insertColumn(db, tasks.id, taskPos, { name: 'Name', type: 'text' })
  taskPos = taskName.position
  const assignee = await insertColumn(db, tasks.id, taskPos, { name: 'Assignee', type: 'user' })
  taskPos = assignee.position
  const due = await insertColumn(db, tasks.id, taskPos, { name: 'Due', type: 'date' })
  taskPos = due.position
  const done = await insertColumn(db, tasks.id, taskPos, { name: 'Done', type: 'checkbox' })
  taskPos = done.position
  const taskDeal = await insertColumn(db, tasks.id, taskPos, { name: 'Deal', type: 'relation' })
  taskPos = taskDeal.position
  const taskDealRelation = await relate(db, tasks.id, deals.id, taskDeal.column.id)
  const taskPerson = await insertColumn(db, tasks.id, taskPos, { name: 'Person', type: 'relation' })
  const taskPersonRelation = await relate(db, tasks.id, people.id, taskPerson.column.id)

  const today = new Date().toISOString().slice(0, 10)
  const followUp = await insertRow(db, tasks.id, userId, null, 1)
  const later = await insertRow(db, tasks.id, userId, followUp.position, 2)
  const finished = await insertRow(db, tasks.id, userId, later.position, 3)
  const someday = await insertRow(db, tasks.id, userId, finished.position, 4)
  await db.insert(tableCells).values([
    { tableId: tasks.id, rowId: followUp.row.id, columnId: taskName.column.id, valueText: 'Follow up' },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: assignee.column.id, valueJsonb: { userIds: [userId] } },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: due.column.id, valueText: today },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: done.column.id, valueBool: false },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: taskDeal.column.id, valueJsonb: { rowId: dealRow.row.id } },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: taskPerson.column.id, valueJsonb: { rowId: personRow.row.id } },
    { tableId: tasks.id, rowId: later.row.id, columnId: taskName.column.id, valueText: 'Later' },
    { tableId: tasks.id, rowId: later.row.id, columnId: assignee.column.id, valueJsonb: { userIds: [userId] } },
    { tableId: tasks.id, rowId: later.row.id, columnId: due.column.id, valueText: '2099-01-01' },
    { tableId: tasks.id, rowId: later.row.id, columnId: done.column.id, valueBool: false },
    { tableId: tasks.id, rowId: finished.row.id, columnId: taskName.column.id, valueText: 'Archive notes' },
    { tableId: tasks.id, rowId: finished.row.id, columnId: assignee.column.id, valueJsonb: { userIds: [userId] } },
    { tableId: tasks.id, rowId: finished.row.id, columnId: due.column.id, valueText: '2020-01-01' },
    { tableId: tasks.id, rowId: finished.row.id, columnId: done.column.id, valueBool: true },
    { tableId: tasks.id, rowId: someday.row.id, columnId: taskName.column.id, valueText: 'Someday' },
    { tableId: tasks.id, rowId: someday.row.id, columnId: assignee.column.id, valueJsonb: { userIds: [userId] } },
    { tableId: tasks.id, rowId: someday.row.id, columnId: done.column.id, valueBool: false },
  ])
  await db.insert(relationRecords).values([
    { relationId: taskDealRelation, fromRowId: followUp.row.id, toRowId: dealRow.row.id },
    { relationId: taskPersonRelation, fromRowId: followUp.row.id, toRowId: personRow.row.id },
  ])

  const meetings = await insertTable(db, projectId, userId, 'Meetings', 'Meetings with people and deals')
  let meetingPos: string | null = null
  const meetingName = await insertColumn(db, meetings.id, meetingPos, { name: 'Name', type: 'text' })
  meetingPos = meetingName.position
  const when = await insertColumn(db, meetings.id, meetingPos, { name: 'When', type: 'datetime' })
  meetingPos = when.position
  const meetingDeal = await insertColumn(db, meetings.id, meetingPos, { name: 'Deal', type: 'relation' })
  meetingPos = meetingDeal.position
  const meetingDealRelation = await relate(db, meetings.id, deals.id, meetingDeal.column.id)
  const meetingPerson = await insertColumn(db, meetings.id, meetingPos, { name: 'Person', type: 'relation' })
  const meetingPersonRelation = await relate(db, meetings.id, people.id, meetingPerson.column.id)
  const meetingRow = await insertRow(db, meetings.id, userId, null, 1)
  await db.insert(tableCells).values([
    { tableId: meetings.id, rowId: meetingRow.row.id, columnId: meetingName.column.id, valueText: 'Kickoff' },
    { tableId: meetings.id, rowId: meetingRow.row.id, columnId: when.column.id, valueText: '2026-11-09T09:00:00.000Z' },
    { tableId: meetings.id, rowId: meetingRow.row.id, columnId: meetingDeal.column.id, valueJsonb: { rowId: dealRow.row.id } },
    { tableId: meetings.id, rowId: meetingRow.row.id, columnId: meetingPerson.column.id, valueJsonb: { rowId: personRow.row.id } },
  ])
  await db.insert(relationRecords).values([
    { relationId: meetingDealRelation, fromRowId: meetingRow.row.id, toRowId: dealRow.row.id },
    { relationId: meetingPersonRelation, fromRowId: meetingRow.row.id, toRowId: personRow.row.id },
  ])
  await db.insert(tableViews).values({
    tableId: meetings.id,
    name: 'Timeline',
    ownerId: userId,
    shared: true,
    definition: {
      filter: null,
      sort: null,
      display: {
        mode: 'timeline',
        chart: { type: 'bar', dimensionIds: [], valueIds: [], perRow: false, count: false, ownerColumnId: null, ownerUserId: null },
        timeline: { dateColumnId: when.column.id, titleColumnIds: [meetingName.column.id], zoom: 1 },
        kanban: { statusColumnId: null, cardColumnIds: [], statusOrder: [] },
      },
    },
  })
  await db.insert(tableViews).values({
    tableId: deals.id,
    name: 'Pipeline',
    ownerId: userId,
    shared: true,
    definition: {
      filter: null,
      sort: null,
      display: {
        mode: 'chart',
        chart: {
          type: 'bar',
          dimensionIds: [stage.column.id],
          valueIds: [amount.column.id],
          perRow: false,
          count: true,
          ownerColumnId: owner.column.id,
          ownerUserId: null,
        },
        timeline: { dateColumnId: null, titleColumnIds: [], zoom: 1 },
        kanban: { statusColumnId: null, cardColumnIds: [], statusOrder: [] },
      },
    },
  })
  return { companies: companies.id, people: people.id, deals: deals.id, tasks: tasks.id, meetings: meetings.id }
}

export async function seedQuotes(db: AppDatabase, projectId: string, userId: string) {
  const products = await insertTable(db, projectId, userId, 'Products', 'Things you sell')
  const quotes = await insertTable(db, projectId, userId, 'Quotes', 'Offers for a customer')
  const lines = await insertTable(db, projectId, userId, 'Lines', 'Products on a quote')
  let productPos: string | null = null
  const productName = await insertColumn(db, products.id, productPos, { name: 'Name', type: 'text' })
  productPos = productName.position
  const price = await insertColumn(db, products.id, productPos, {
    name: 'Price',
    type: 'number',
    config: { icon: 'Coins', variant: 'money', currency: 'EUR' },
  })
  let quotePos: string | null = null
  const quoteName = await insertColumn(db, quotes.id, quotePos, { name: 'Name', type: 'text' })
  quotePos = quoteName.position
  const status = await insertColumn(db, quotes.id, quotePos, {
    name: 'Status',
    type: 'select',
    options: [
      { label: 'Draft', color: 'slate' },
      { label: 'Sent', color: 'blue' },
      { label: 'Accepted', color: 'green' },
    ],
  })
  quotePos = status.position
  const customer = await insertColumn(db, quotes.id, quotePos, { name: 'Customer', type: 'text' })
  let linePos: string | null = null
  const lineQuote = await insertColumn(db, lines.id, linePos, { name: 'Quote', type: 'relation' })
  linePos = lineQuote.position
  const quoteRelation = await relate(db, lines.id, quotes.id, lineQuote.column.id)
  const lineProduct = await insertColumn(db, lines.id, linePos, { name: 'Product', type: 'relation' })
  linePos = lineProduct.position
  const productRelation = await relate(db, lines.id, products.id, lineProduct.column.id)
  const quantity = await insertColumn(db, lines.id, linePos, { name: 'Quantity', type: 'number' })
  const productRow = await insertRow(db, products.id, userId, null, 1)
  await db.insert(tableCells).values([
    { tableId: products.id, rowId: productRow.row.id, columnId: productName.column.id, valueText: 'Workshop' },
    { tableId: products.id, rowId: productRow.row.id, columnId: price.column.id, valueNumber: '500' },
  ])
  const quoteRow = await insertRow(db, quotes.id, userId, null, 1)
  const draft = (await db.select().from(columnOptions).where(eq(columnOptions.columnId, status.column.id))).find(
    (option) => option.label === 'Draft',
  )
  await db.insert(tableCells).values([
    { tableId: quotes.id, rowId: quoteRow.row.id, columnId: quoteName.column.id, valueText: 'Northwind site' },
    { tableId: quotes.id, rowId: quoteRow.row.id, columnId: status.column.id, valueJsonb: { optionId: draft?.id ?? null } },
    { tableId: quotes.id, rowId: quoteRow.row.id, columnId: customer.column.id, valueText: 'Northwind' },
  ])
  const lineRow = await insertRow(db, lines.id, userId, null, 1)
  await db.insert(tableCells).values([
    { tableId: lines.id, rowId: lineRow.row.id, columnId: lineQuote.column.id, valueJsonb: { rowId: quoteRow.row.id } },
    { tableId: lines.id, rowId: lineRow.row.id, columnId: lineProduct.column.id, valueJsonb: { rowId: productRow.row.id } },
    { tableId: lines.id, rowId: lineRow.row.id, columnId: quantity.column.id, valueNumber: '2' },
  ])
  await db.insert(relationRecords).values([
    { relationId: quoteRelation, fromRowId: lineRow.row.id, toRowId: quoteRow.row.id },
    { relationId: productRelation, fromRowId: lineRow.row.id, toRowId: productRow.row.id },
  ])
  return { products: products.id, quotes: quotes.id, lines: lines.id }
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
