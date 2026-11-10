import { validateFlow, type AutomationCatalogTable, type AutomationFlow } from '@datavalley/shared'
import { eq } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import type { AppDatabase } from '../../database/client.js'
import {
  columnOptions,
  projects,
  relationRecords,
  relations,
  tableCells,
  tableColumns,
  tableRows,
  tableViews,
  tables,
} from '../../database/schema.js'
import { defaultColumnIcon } from '../../column-types/index.js'

async function nextPosition(db: AppDatabase, projectId: string) {
  const existing = await db
    .select({ position: tables.position })
    .from(tables)
    .where(eq(tables.projectId, projectId))
  const last =
    existing
      .map((row) => row.position)
      .sort()
      .at(-1) ?? null
  return generateKeyBetween(last, null)
}

export async function seedStarter(db: AppDatabase, projectId: string, userId: string) {
  const [table] = await db
    .insert(tables)
    .values({
      projectId,
      name: 'People',
      description: '',
      position: await nextPosition(db, projectId),
      createdBy: userId,
    })
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
    .values({
      tableId: table.id,
      position: generateKeyBetween(null, null),
      rowNumber: 1,
      createdBy: userId,
    })
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
    await db
      .insert(columnOptions)
      .values({ columnId: status.id, label, position: optionPos, color: null })
  }
  return table.id
}

async function insertTable(
  db: AppDatabase,
  projectId: string,
  userId: string,
  name: string,
  description: string,
  activity = false,
) {
  const [table] = await db
    .insert(tables)
    .values({
      projectId,
      name,
      description,
      position: await nextPosition(db, projectId),
      createdBy: userId,
      activity,
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

async function relate(db: AppDatabase, fromTableId: string, toTableId: string, columnId: string) {
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
  const [column] = await db
    .select()
    .from(tableColumns)
    .where(eq(tableColumns.id, columnId))
    .limit(1)
  const config = {
    ...(column.config as Record<string, unknown>),
    relationId: relation.id,
    toTableId,
  }
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
  await db
    .update(tables)
    .set({ nextRowNumber: rowNumber + 1 })
    .where(eq(tables.id, tableId))
  return { row, position: next }
}

export async function seedCrm(db: AppDatabase, projectId: string, userId: string) {
  const companies = await insertTable(db, projectId, userId, 'Companies', 'Accounts you sell to')
  const people = await insertTable(db, projectId, userId, 'People', 'Contacts at those companies')
  const deals = await insertTable(db, projectId, userId, 'Deals', 'Pipeline of opportunities')

  let companyPos: string | null = null
  const companyName = await insertColumn(db, companies.id, companyPos, {
    name: 'Name',
    type: 'text',
  })
  companyPos = companyName.position
  const companyDomain = await insertColumn(db, companies.id, companyPos, {
    name: 'Domain',
    type: 'url',
  })

  let personPos: string | null = null
  const personName = await insertColumn(db, people.id, personPos, { name: 'Name', type: 'text' })
  personPos = personName.position
  const personMail = await insertColumn(db, people.id, personPos, { name: 'Email', type: 'mail' })
  personPos = personMail.position
  const personCompany = await insertColumn(db, people.id, personPos, {
    name: 'Company',
    type: 'relation',
  })
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
  const dealCompany = await insertColumn(db, deals.id, dealPos, {
    name: 'Company',
    type: 'relation',
  })
  dealPos = dealCompany.position
  const dealRelation = await relate(db, deals.id, companies.id, dealCompany.column.id)
  const dealPerson = await insertColumn(db, deals.id, dealPos, { name: 'Person', type: 'relation' })
  const personDealRelation = await relate(db, deals.id, people.id, dealPerson.column.id)

  const companyRow = await insertRow(db, companies.id, userId, null, 1)
  await db.insert(tableCells).values([
    {
      tableId: companies.id,
      rowId: companyRow.row.id,
      columnId: companyName.column.id,
      valueText: 'Northwind',
    },
    {
      tableId: companies.id,
      rowId: companyRow.row.id,
      columnId: companyDomain.column.id,
      valueText: 'https://northwind.example',
    },
  ])
  const personRow = await insertRow(db, people.id, userId, null, 1)
  await db.insert(tableCells).values([
    {
      tableId: people.id,
      rowId: personRow.row.id,
      columnId: personName.column.id,
      valueText: 'Ada Lovelace',
    },
    {
      tableId: people.id,
      rowId: personRow.row.id,
      columnId: personMail.column.id,
      valueText: 'ada@northwind.example',
    },
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
  const stageOptions = await db
    .select()
    .from(columnOptions)
    .where(eq(columnOptions.columnId, stage.column.id))
  const qualified = stageOptions.find((option) => option.label === 'Qualified')
  const dealRow = await insertRow(db, deals.id, userId, null, 1)
  await db.insert(tableCells).values([
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: dealName.column.id,
      valueText: 'Website',
    },
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: stage.column.id,
      valueJsonb: { optionId: qualified?.id ?? null },
    },
    { tableId: deals.id, rowId: dealRow.row.id, columnId: amount.column.id, valueNumber: '12000' },
    {
      tableId: deals.id,
      rowId: dealRow.row.id,
      columnId: closeDate.column.id,
      valueText: '2026-12-01',
    },
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

  const tasks = await insertTable(
    db,
    projectId,
    userId,
    'Tasks',
    'Follow-ups on deals and people',
    true,
  )
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
    {
      tableId: tasks.id,
      rowId: followUp.row.id,
      columnId: taskName.column.id,
      valueText: 'Follow up',
    },
    {
      tableId: tasks.id,
      rowId: followUp.row.id,
      columnId: assignee.column.id,
      valueJsonb: { userIds: [userId] },
    },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: due.column.id, valueText: today },
    { tableId: tasks.id, rowId: followUp.row.id, columnId: done.column.id, valueBool: false },
    {
      tableId: tasks.id,
      rowId: followUp.row.id,
      columnId: taskDeal.column.id,
      valueJsonb: { rowId: dealRow.row.id },
    },
    {
      tableId: tasks.id,
      rowId: followUp.row.id,
      columnId: taskPerson.column.id,
      valueJsonb: { rowId: personRow.row.id },
    },
    { tableId: tasks.id, rowId: later.row.id, columnId: taskName.column.id, valueText: 'Later' },
    {
      tableId: tasks.id,
      rowId: later.row.id,
      columnId: assignee.column.id,
      valueJsonb: { userIds: [userId] },
    },
    { tableId: tasks.id, rowId: later.row.id, columnId: due.column.id, valueText: '2099-01-01' },
    { tableId: tasks.id, rowId: later.row.id, columnId: done.column.id, valueBool: false },
    {
      tableId: tasks.id,
      rowId: finished.row.id,
      columnId: taskName.column.id,
      valueText: 'Archive notes',
    },
    {
      tableId: tasks.id,
      rowId: finished.row.id,
      columnId: assignee.column.id,
      valueJsonb: { userIds: [userId] },
    },
    { tableId: tasks.id, rowId: finished.row.id, columnId: due.column.id, valueText: '2020-01-01' },
    { tableId: tasks.id, rowId: finished.row.id, columnId: done.column.id, valueBool: true },
    {
      tableId: tasks.id,
      rowId: someday.row.id,
      columnId: taskName.column.id,
      valueText: 'Someday',
    },
    {
      tableId: tasks.id,
      rowId: someday.row.id,
      columnId: assignee.column.id,
      valueJsonb: { userIds: [userId] },
    },
    { tableId: tasks.id, rowId: someday.row.id, columnId: done.column.id, valueBool: false },
  ])
  await db.insert(relationRecords).values([
    { relationId: taskDealRelation, fromRowId: followUp.row.id, toRowId: dealRow.row.id },
    { relationId: taskPersonRelation, fromRowId: followUp.row.id, toRowId: personRow.row.id },
  ])

  const meetings = await insertTable(
    db,
    projectId,
    userId,
    'Meetings',
    'Meetings with people and deals',
    true,
  )
  let meetingPos: string | null = null
  const meetingName = await insertColumn(db, meetings.id, meetingPos, {
    name: 'Name',
    type: 'text',
  })
  meetingPos = meetingName.position
  const when = await insertColumn(db, meetings.id, meetingPos, { name: 'When', type: 'datetime' })
  meetingPos = when.position
  const meetingDeal = await insertColumn(db, meetings.id, meetingPos, {
    name: 'Deal',
    type: 'relation',
  })
  meetingPos = meetingDeal.position
  const meetingDealRelation = await relate(db, meetings.id, deals.id, meetingDeal.column.id)
  const meetingPerson = await insertColumn(db, meetings.id, meetingPos, {
    name: 'Person',
    type: 'relation',
  })
  const meetingPersonRelation = await relate(db, meetings.id, people.id, meetingPerson.column.id)
  const meetingRow = await insertRow(db, meetings.id, userId, null, 1)
  await db.insert(tableCells).values([
    {
      tableId: meetings.id,
      rowId: meetingRow.row.id,
      columnId: meetingName.column.id,
      valueText: 'Kickoff',
    },
    {
      tableId: meetings.id,
      rowId: meetingRow.row.id,
      columnId: when.column.id,
      valueText: '2026-11-09T09:00:00.000Z',
    },
    {
      tableId: meetings.id,
      rowId: meetingRow.row.id,
      columnId: meetingDeal.column.id,
      valueJsonb: { rowId: dealRow.row.id },
    },
    {
      tableId: meetings.id,
      rowId: meetingRow.row.id,
      columnId: meetingPerson.column.id,
      valueJsonb: { rowId: personRow.row.id },
    },
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
        chart: {
          type: 'bar',
          dimensionIds: [],
          valueIds: [],
          perRow: false,
          count: false,
          ownerColumnId: null,
          ownerUserId: null,
        },
        timeline: {
          dateColumnId: when.column.id,
          titleColumnIds: [meetingName.column.id],
          zoom: 1,
        },
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
  return {
    companies: companies.id,
    people: people.id,
    deals: deals.id,
    tasks: tasks.id,
    meetings: meetings.id,
  }
}

export async function seedQuotes(db: AppDatabase, projectId: string, userId: string) {
  const products = await insertTable(db, projectId, userId, 'Products', 'Things you sell')
  const quotes = await insertTable(db, projectId, userId, 'Quotes', 'Offers for a customer')
  const lines = await insertTable(db, projectId, userId, 'Lines', 'Products on a quote')
  let productPos: string | null = null
  const productName = await insertColumn(db, products.id, productPos, {
    name: 'Name',
    type: 'text',
  })
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
  const lineProduct = await insertColumn(db, lines.id, linePos, {
    name: 'Product',
    type: 'relation',
  })
  linePos = lineProduct.position
  const productRelation = await relate(db, lines.id, products.id, lineProduct.column.id)
  const quantity = await insertColumn(db, lines.id, linePos, { name: 'Quantity', type: 'number' })
  const productRow = await insertRow(db, products.id, userId, null, 1)
  await db.insert(tableCells).values([
    {
      tableId: products.id,
      rowId: productRow.row.id,
      columnId: productName.column.id,
      valueText: 'Workshop',
    },
    {
      tableId: products.id,
      rowId: productRow.row.id,
      columnId: price.column.id,
      valueNumber: '500',
    },
  ])
  const quoteRow = await insertRow(db, quotes.id, userId, null, 1)
  const draft = (
    await db.select().from(columnOptions).where(eq(columnOptions.columnId, status.column.id))
  ).find((option) => option.label === 'Draft')
  await db.insert(tableCells).values([
    {
      tableId: quotes.id,
      rowId: quoteRow.row.id,
      columnId: quoteName.column.id,
      valueText: 'Northwind site',
    },
    {
      tableId: quotes.id,
      rowId: quoteRow.row.id,
      columnId: status.column.id,
      valueJsonb: { optionId: draft?.id ?? null },
    },
    {
      tableId: quotes.id,
      rowId: quoteRow.row.id,
      columnId: customer.column.id,
      valueText: 'Northwind',
    },
  ])
  const lineRow = await insertRow(db, lines.id, userId, null, 1)
  await db.insert(tableCells).values([
    {
      tableId: lines.id,
      rowId: lineRow.row.id,
      columnId: lineQuote.column.id,
      valueJsonb: { rowId: quoteRow.row.id },
    },
    {
      tableId: lines.id,
      rowId: lineRow.row.id,
      columnId: lineProduct.column.id,
      valueJsonb: { rowId: productRow.row.id },
    },
    { tableId: lines.id, rowId: lineRow.row.id, columnId: quantity.column.id, valueNumber: '2' },
  ])
  await db.insert(relationRecords).values([
    { relationId: quoteRelation, fromRowId: lineRow.row.id, toRowId: quoteRow.row.id },
    { relationId: productRelation, fromRowId: lineRow.row.id, toRowId: productRow.row.id },
  ])
  await db
    .update(tables)
    .set({
      documentConfig: {
        kind: 'quote',
        linesTableId: lines.id,
        quoteColumnId: lineQuote.column.id,
        productColumnId: lineProduct.column.id,
        quantityColumnId: quantity.column.id,
        priceColumnId: price.column.id,
        customerColumnId: customer.column.id,
        statusColumnId: status.column.id,
      },
    })
    .where(eq(tables.id, quotes.id))
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
    const [column] = await db
      .insert(tableColumns)
      .values({ tableId, name, type: 'text', position: columnPos })
      .returning()
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

export async function seedAutomationTest(db: AppDatabase, projectId: string, userId: string) {
  const orders = await insertTable(db, projectId, userId, 'Orders', 'Rows that start the sample flows')
  const tasks = await insertTable(db, projectId, userId, 'Tasks', 'Rows the sample flows create')
  let orderPos: string | null = null
  const orderName = await insertColumn(db, orders.id, orderPos, { name: 'Name', type: 'text' })
  orderPos = orderName.position
  const status = await insertColumn(db, orders.id, orderPos, {
    name: 'Status',
    type: 'select',
    options: [
      { label: 'Open', color: 'blue' },
      { label: 'Hold', color: 'amber' },
    ],
  })
  orderPos = status.position
  const amount = await insertColumn(db, orders.id, orderPos, { name: 'Amount', type: 'number' })
  orderPos = amount.position
  await insertColumn(db, orders.id, orderPos, { name: 'Paid', type: 'checkbox' })
  const taskName = await insertColumn(db, tasks.id, null, { name: 'Name', type: 'text' })
  const orderLink = await insertColumn(db, tasks.id, taskName.position, { name: 'Order', type: 'relation' })
  await relate(db, tasks.id, orders.id, orderLink.column.id)
  const statusOptions = await db.select().from(columnOptions).where(eq(columnOptions.columnId, status.column.id))
  const open = statusOptions.find((option) => option.label === 'Open')
  if (!open) throw new Error('Missing Open status')
  const paid = await db
    .select()
    .from(tableColumns)
    .where(eq(tableColumns.tableId, orders.id))
  const paidColumn = paid.find((column) => column.name === 'Paid')
  if (!paidColumn) throw new Error('Missing Paid')
  const catalog: AutomationCatalogTable[] = [
    {
      id: orders.id,
      name: 'Orders',
      columns: [
        { id: orderName.column.id, name: 'Name', type: 'text', toTableId: null, choices: [] },
        {
          id: status.column.id,
          name: 'Status',
          type: 'select',
          toTableId: null,
          choices: statusOptions.map((option) => ({ id: option.id, label: option.label })),
        },
        { id: amount.column.id, name: 'Amount', type: 'number', toTableId: null, choices: [] },
        { id: paidColumn.id, name: 'Paid', type: 'checkbox', toTableId: null, choices: [] },
      ],
    },
    {
      id: tasks.id,
      name: 'Tasks',
      columns: [
        { id: taskName.column.id, name: 'Name', type: 'text', toTableId: null, choices: [] },
        { id: orderLink.column.id, name: 'Order', type: 'relation', toTableId: orders.id, choices: [] },
      ],
    },
  ]
  const flows = automationTestFlows({
    ordersId: orders.id,
    tasksId: tasks.id,
    nameId: orderName.column.id,
    statusId: status.column.id,
    openId: open.id,
    amountId: amount.column.id,
    paidId: paidColumn.id,
    taskNameId: taskName.column.id,
    linkId: orderLink.column.id,
  })
  for (const flow of flows) {
    const issues = validateFlow(flow, catalog)
    if (issues.length > 0) throw new Error(`Automation Test flow ${flow.name}: ${issues.map((issue) => issue.code).join(', ')}`)
  }
  const [project] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, projectId)).limit(1)
  const previous = (project?.settings ?? {}) as Record<string, unknown>
  await db
    .update(projects)
    .set({ settings: { ...previous, automations: { rules: [], flows } }, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
}

function automationTestFlows(ids: {
  ordersId: string
  tasksId: string
  nameId: string
  statusId: string
  openId: string
  amountId: string
  paidId: string
  taskNameId: string
  linkId: string
}): AutomationFlow[] {
  const spot = (x: number, y = 0) => ({ x, y })
  const make = (id: string, title: string, y = 0): AutomationFlow['nodes'][number] => ({
    id,
    type: 'action',
    action: 'create',
    tableId: ids.tasksId,
    linkColumnId: null,
    fields: [{ columnId: ids.taskNameId, value: { kind: 'literal', value: title } }],
    position: spot(420, y),
  })
  return [
    {
      id: crypto.randomUUID(),
      name: 'When an order is added',
      enabled: true,
      nodes: [
        { id: 'create-start', type: 'trigger', tableId: ids.ordersId, event: 'row_created', columnId: ids.nameId, position: spot(40) },
        {
          id: 'create-task',
          type: 'action',
          action: 'create',
          tableId: ids.tasksId,
          linkColumnId: null,
          fields: [{ columnId: ids.taskNameId, value: { kind: 'template', template: 'Task for {{label}}' } }],
          position: spot(320),
        },
      ],
      edges: [{ id: 'create-edge', source: 'create-start', target: 'create-task', when: null }],
    },
    {
      id: crypto.randomUUID(),
      name: 'When an order is deleted',
      enabled: true,
      nodes: [
        { id: 'delete-start', type: 'trigger', tableId: ids.ordersId, event: 'row_deleted', columnId: ids.nameId, position: spot(40) },
        {
          id: 'delete-task',
          type: 'action',
          action: 'create',
          tableId: ids.tasksId,
          linkColumnId: null,
          fields: [{ columnId: ids.taskNameId, value: { kind: 'template', template: 'Removed {{label}}' } }],
          position: spot(320),
        },
      ],
      edges: [{ id: 'delete-edge', source: 'delete-start', target: 'delete-task', when: null }],
    },
    {
      id: crypto.randomUUID(),
      name: 'Paid or not',
      enabled: true,
      nodes: [
        { id: 'paid-start', type: 'trigger', tableId: ids.ordersId, event: 'column_changed', columnId: ids.paidId, position: spot(40) },
        { id: 'paid-check', type: 'condition', columnId: ids.paidId, op: 'is_true', value: null, position: spot(280) },
        make('paid-yes', 'Yes row'),
        make('paid-no', 'No row', 140),
      ],
      edges: [
        { id: 'paid-to-check', source: 'paid-start', target: 'paid-check', when: null },
        { id: 'paid-to-yes', source: 'paid-check', target: 'paid-yes', when: 'yes' },
        { id: 'paid-to-no', source: 'paid-check', target: 'paid-no', when: 'no' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Status path',
      enabled: true,
      nodes: [
        { id: 'status-start', type: 'trigger', tableId: ids.ordersId, event: 'column_changed', columnId: ids.statusId, position: spot(40) },
        {
          id: 'status-branch',
          type: 'switch',
          columnId: ids.statusId,
          cases: [{ id: 'status-open', optionIds: [ids.openId] }],
          position: spot(280),
        },
        make('status-case', 'Case row'),
        make('status-else', 'Else row', 140),
      ],
      edges: [
        { id: 'status-to-branch', source: 'status-start', target: 'status-branch', when: null },
        { id: 'status-to-case', source: 'status-branch', target: 'status-case', when: 'status-open' },
        { id: 'status-to-else', source: 'status-branch', target: 'status-else', when: 'else' },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Update rows',
      enabled: true,
      nodes: [
        { id: 'update-start', type: 'trigger', tableId: ids.ordersId, event: 'column_changed', columnId: ids.amountId, position: spot(40) },
        {
          id: 'update-source',
          type: 'action',
          action: 'update_source',
          tableId: ids.ordersId,
          linkColumnId: null,
          fields: [{ columnId: ids.nameId, value: { kind: 'literal', value: 'Source row' } }],
          position: spot(280),
        },
        {
          id: 'update-linked',
          type: 'action',
          action: 'update_linked',
          tableId: ids.tasksId,
          linkColumnId: ids.linkId,
          fields: [{ columnId: ids.taskNameId, value: { kind: 'literal', value: 'Linked row' } }],
          position: spot(520),
        },
        {
          id: 'update-make',
          type: 'action',
          action: 'create',
          tableId: ids.tasksId,
          linkColumnId: null,
          fields: [
            { columnId: ids.taskNameId, value: { kind: 'literal', value: 'Draft' } },
            { columnId: ids.linkId, value: { kind: 'template', template: '{{row}}' } },
          ],
          position: spot(760),
        },
        {
          id: 'update-created',
          type: 'action',
          action: 'update_created',
          tableId: ids.tasksId,
          linkColumnId: null,
          fields: [{ columnId: ids.taskNameId, value: { kind: 'literal', value: 'Created row' } }],
          position: spot(1000),
        },
      ],
      edges: [
        { id: 'update-to-source', source: 'update-start', target: 'update-source', when: null },
        { id: 'update-to-linked', source: 'update-source', target: 'update-linked', when: null },
        { id: 'update-to-make', source: 'update-linked', target: 'update-make', when: null },
        { id: 'update-to-created', source: 'update-make', target: 'update-created', when: null },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Turned off',
      enabled: false,
      nodes: [
        { id: 'off-start', type: 'trigger', tableId: ids.ordersId, event: 'column_changed', columnId: ids.nameId, position: spot(40) },
        make('off-task', 'Should not run'),
      ],
      edges: [{ id: 'off-edge', source: 'off-start', target: 'off-task', when: null }],
    },
  ]
}
