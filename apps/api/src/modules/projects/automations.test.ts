import { builtinStageRule, type AutomationFlow, type CustomAutomationRule } from '@datavalley/shared'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { projects } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('activity timeline and automation rules', () => {
  let harness: Harness

  afterEach(async () => {
    await harness?.close()
  })

  it('lists notes and linked activity rows on the deal record', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const tasks = tables.find((table) => table.name === 'Tasks')
    const meetings = tables.find((table) => table.name === 'Meetings')
    expect(tasks?.activity).toBe(true)
    expect(meetings?.activity).toBe(true)
    const deal = await firstDeal(session, tables)
    const record = await session.inject({ method: 'GET', url: `/api/v1/rows/${deal.id}/record` })
    expect(record.statusCode).toBe(200)
    const titles = activityTitles(record.json())
    expect(titles).toContain('Follow up')
    expect(titles).toContain('Kickoff')
    expect(titles).not.toContain('Northwind')
    const noted = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: deal.version, notes: 'Call next week' },
    })
    expect(noted.statusCode).toBe(200)
    const again = await session.inject({ method: 'GET', url: `/api/v1/rows/${deal.id}/record` })
    const activity = again.json().activity as { kind: string; text: string; title: string }[]
    expect(activity.some((item) => item.kind === 'notes' && item.text === 'Call next week')).toBe(true)
    const hidden = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tasks?.id}`,
      payload: { activity: false },
    })
    expect(hidden.statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/rows/${deal.id}/record` })
    const left = activityTitles(after.json())
    expect(left).not.toContain('Follow up')
    expect(left).toContain('Kickoff')
  })

  it('does not create a follow-up task when a deal stage changes', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const before = await taskTitles(session, tables)
    await changeStage(session, tables, 'Proposal')
    expect(await taskTitles(session, tables)).toEqual(before)
  })

  it('creates a task from a project rule and stops when that rule is off', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const deals = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Deals')}` })
    const tasks = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Tasks')}` })
    const stage = column(deals.json().table, 'Stage')
    const name = column(tasks.json().table, 'Name')
    const dealColumn = column(tasks.json().table, 'Deal')
    const rule: CustomAutomationRule = {
      id: '11111111-1111-4111-8111-111111111111',
      builtin: false,
      enabled: true,
      sourceTableId: idOf(tables, 'Deals'),
      sourceColumnId: stage.id,
      action: 'create',
      targetTableId: idOf(tables, 'Tasks'),
      linkColumnId: dealColumn.id,
      cells: [
        { columnId: name.id, template: 'Call: {{label}}' },
        { columnId: dealColumn.id, template: '{{row}}' },
      ],
    }
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false), rule] },
    })
    expect(saved.statusCode).toBe(200)
    const created = await changeStage(session, tables, 'Proposal')
    expect(await taskTitles(session, tables)).toContain('Call: Proposal')
    const record = await session.inject({ method: 'GET', url: `/api/v1/rows/${created.dealId}/record` })
    expect(activityTitles(record.json())).toContain('Call: Proposal')
    const off = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false), { ...rule, enabled: false }] },
    })
    expect(off.statusCode).toBe(200)
    await changeStage(session, tables, 'Won', created.version)
    expect(await taskTitles(session, tables)).not.toContain('Call: Won')
  })

  it('updates the linked task from a project rule', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const deals = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Deals')}` })
    const tasks = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Tasks')}` })
    const stage = column(deals.json().table, 'Stage')
    const name = column(tasks.json().table, 'Name')
    const dealColumn = column(tasks.json().table, 'Deal')
    const before = await taskTitles(session, tables)
    const rule: CustomAutomationRule = {
      id: '22222222-2222-4222-8222-222222222222',
      builtin: false,
      enabled: true,
      sourceTableId: idOf(tables, 'Deals'),
      sourceColumnId: stage.id,
      action: 'update',
      targetTableId: idOf(tables, 'Tasks'),
      linkColumnId: dealColumn.id,
      cells: [{ columnId: name.id, template: 'Stage: {{label}}' }],
    }
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false), rule] },
    })
    expect(saved.statusCode).toBe(200)
    await changeStage(session, tables, 'Proposal')
    const titles = await taskTitles(session, tables)
    expect(titles).toContain('Stage: Proposal')
    expect(titles).toHaveLength(before.length)
    expect(titles).not.toContain('Follow up')
  })

  it('refuses rule changes from a read-only member', async () => {
    const { session, projectId } = await crm()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
      role: 'user',
    })
    const added = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/members`,
      payload: { username: 'bea', preset: 'view' },
    })
    expect(added.statusCode).toBe(200)
    const bea = await new ApiSession(harness.app).prepare()
    expect((await login(bea, 'bea', password)).statusCode).toBe(200)
    const listed = await bea.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/automations` })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().canEdit).toBe(false)
    expect(listed.json().rules).toEqual([])
    const denied = await bea.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false)] },
    })
    expect(denied.statusCode).toBe(404)
  })

  it('follows one status path and ignores the other', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const dealsId = idOf(tables, 'Deals')
    const tasksId = idOf(tables, 'Tasks')
    const health = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dealsId}/columns`,
      payload: { name: 'Health', type: 'status' },
    })
    expect(health.statusCode).toBe(200)
    const open = await session.inject({ method: 'POST', url: `/api/v1/tables/${dealsId}/statuses`, payload: { name: 'Open' } })
    const won = await session.inject({ method: 'POST', url: `/api/v1/tables/${dealsId}/statuses`, payload: { name: 'Won' } })
    expect(open.statusCode).toBe(200)
    const tasks = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}` })
    const name = column(tasks.json().table, 'Name')
    const openId = open.json().status.id as string
    const wonId = won.json().status.id as string
    const healthId = health.json().column.id as string
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: {
        rules: [builtinStageRule(false)],
        flows: [
          statusFlow(dealsId, tasksId, healthId, name.id, openId, wonId),
        ],
      },
    })
    expect(saved.statusCode).toBe(200)
    const deal = await firstDeal(session, tables)
    const opened = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: deal.version, cells: { [healthId]: openId } },
    })
    expect(opened.statusCode).toBe(200)
    expect(await taskTitles(session, tables)).toContain('Status Open')
    expect(await taskTitles(session, tables)).not.toContain('Status Won')
    const closed = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: opened.json().row.version, cells: { [healthId]: wonId } },
    })
    expect(closed.statusCode).toBe(200)
    const titles = await taskTitles(session, tables)
    expect(titles.filter((title) => title === 'Status Open')).toHaveLength(1)
    expect(titles.filter((title) => title === 'Status Won')).toHaveLength(1)
  })

  it('does nothing when a true-only checkbox is cleared', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const tasksId = idOf(tables, 'Tasks')
    const tasks = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}` })
    const done = column(tasks.json().table, 'Done')
    const name = column(tasks.json().table, 'Name')
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false)], flows: [checkboxFlow(tasksId, done.id, name.id)] },
    })
    expect(saved.statusCode).toBe(200)
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}/rows` })
    const archive = (rows.json().rows as { id: string; version: number; title: string }[]).find((row) => row.title === 'Archive notes')
    const follow = (rows.json().rows as { id: string; version: number; title: string }[]).find((row) => row.title === 'Follow up')
    if (!archive || !follow) throw new Error('Missing task')
    const cleared = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${archive.id}`,
      payload: { version: archive.version, cells: { [done.id]: false } },
    })
    expect(cleared.statusCode).toBe(200)
    expect(await taskTitles(session, tables)).not.toContain('Box on')
    const checked = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${follow.id}`,
      payload: { version: follow.version, cells: { [done.id]: true } },
    })
    expect(checked.statusCode).toBe(200)
    expect(await taskTitles(session, tables)).toContain('Box on')
  })

  it('rejects enabling a flow that writes a number into a checkbox', async () => {
    const { session, projectId } = await crm()
    const tables = await tableList(session, projectId)
    const tasksId = idOf(tables, 'Tasks')
    const tasks = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}` })
    const done = column(tasks.json().table, 'Done')
    const bad = checkboxFlow(tasksId, done.id, done.id)
    const action = bad.nodes.find((node) => node.type === 'action')
    if (!action || action.type !== 'action') throw new Error('Missing action')
    action.fields = [{ columnId: done.id, value: { kind: 'literal', value: 1 } }]
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false)], flows: [{ ...bad, enabled: true }] },
    })
    expect(saved.statusCode).toBe(400)
    expect(saved.json().error.message).toContain('type_mismatch')
    const draft = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false)], flows: [{ ...bad, enabled: false }] },
    })
    expect(draft.statusCode).toBe(200)
    expect(draft.json().flows[0].enabled).toBe(false)
  })

  it('creates a task whose name uses the new row label', async () => {
    const shop = await orders()
    await saveFlows(shop, [onCreate(shop)])
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget' } },
    })
    expect(created.statusCode).toBe(200)
    expect(await rowTitles(shop.session, shop.tasksId)).toContain('Task for Widget')
  })

  it('creates a task when a row is deleted and does not write the order back', async () => {
    const shop = await orders()
    await saveFlows(shop, [onDelete(shop)])
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget' } },
    })
    expect(created.statusCode).toBe(200)
    const removed = await shop.session.inject({ method: 'DELETE', url: `/api/v1/rows/${created.json().row.id}` })
    expect(removed.statusCode).toBe(200)
    expect(await rowTitles(shop.session, shop.ordersId)).not.toContain('Widget')
    expect(await rowTitles(shop.session, shop.tasksId)).toEqual(['Removed Widget'])
  })

  it('follows the yes path, the no path, and skips yes when a checkbox is cleared', async () => {
    const shop = await orders()
    await saveFlows(shop, [paidPaths(shop)])
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget', [shop.paidId]: false } },
    })
    expect(created.statusCode).toBe(200)
    const row = created.json().row as { id: string; version: number }
    const paid = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: { [shop.paidId]: true } },
    })
    expect(paid.statusCode).toBe(200)
    expect(await rowTitles(shop.session, shop.tasksId)).toContain('Yes row')
    const cleared = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: paid.json().row.version, cells: { [shop.paidId]: false } },
    })
    expect(cleared.statusCode).toBe(200)
    const titles = await rowTitles(shop.session, shop.tasksId)
    expect(titles.filter((title) => title === 'Yes row')).toHaveLength(1)
    expect(titles).toContain('No row')
  })

  it('takes the matching switch case and uses else for another value', async () => {
    const shop = await orders()
    await saveFlows(shop, [statusPaths(shop)])
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget' } },
    })
    const row = created.json().row as { id: string; version: number }
    const open = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: { [shop.statusId]: shop.openId } },
    })
    expect(open.statusCode).toBe(200)
    expect(await rowTitles(shop.session, shop.tasksId)).toContain('Case row')
    const held = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: open.json().row.version, cells: { [shop.statusId]: shop.holdId } },
    })
    expect(held.statusCode).toBe(200)
    const titles = await rowTitles(shop.session, shop.tasksId)
    expect(titles).toContain('Case row')
    expect(titles).toContain('Else row')
  })

  it('updates the triggering row, the linked task, and the task created in the same flow', async () => {
    const shop = await orders()
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget', [shop.amountId]: 1 } },
    })
    const order = created.json().row as { id: string; version: number }
    const task = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.tasksId}/rows`,
      payload: { cells: { [shop.taskNameId]: 'Old' } },
    })
    const linked = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/relations/${shop.relationId}/records`,
      payload: { fromRowId: task.json().row.id, toRowId: order.id },
    })
    expect(linked.statusCode).toBe(200)
    await saveFlows(shop, [updates(shop)])
    const patched = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${order.id}`,
      payload: { version: order.version, cells: { [shop.amountId]: 2 } },
    })
    expect(patched.statusCode).toBe(200)
    const saved = patched.json().row as { version: number; title: string; cells: Record<string, unknown> }
    expect(saved.title).toBe('Source row')
    expect(saved.cells[shop.nameId]).toBe('Source row')
    expect(saved.version).toBeGreaterThan(order.version)
    expect(await rowTitles(shop.session, shop.ordersId)).toContain('Source row')
    const titles = await rowTitles(shop.session, shop.tasksId)
    expect(titles).toContain('Linked row')
    expect(titles).toContain('Created row')
    expect(titles).not.toContain('Draft')
    expect(titles).not.toContain('Old')
  })

  it('keeps a name edit when only the amount column starts a flow', async () => {
    const shop = await orders()
    await saveFlows(shop, [updates(shop)])
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget' } },
    })
    const row = created.json().row as { id: string; version: number }
    const patched = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: { [shop.nameId]: 'Acme order' } },
    })
    expect(patched.statusCode).toBe(200)
    const saved = patched.json().row as { title: string; cells: Record<string, unknown> }
    expect(saved.title).toBe('Acme order')
    expect(saved.cells[shop.nameId]).toBe('Acme order')
    expect(await rowTitles(shop.session, shop.ordersId)).toEqual(['Acme order'])
    expect(await rowTitles(shop.session, shop.tasksId)).toEqual([])
  })

  it('does nothing for a disabled flow, another table, or another column', async () => {
    const shop = await orders()
    await saveFlows(shop, quietFlows(shop))
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget', [shop.amountId]: 1 } },
    })
    const row = created.json().row as { id: string; version: number }
    const patched = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: { [shop.amountId]: 9 } },
    })
    expect(patched.statusCode).toBe(200)
    expect(await rowTitles(shop.session, shop.tasksId)).toEqual([])
  })

  it('stops a cycle instead of repeating the actions', async () => {
    const shop = await orders()
    await harness.db
      .update(projects)
      .set({ settings: { automations: { rules: [], flows: [cycle(shop)] } } })
      .where(eq(projects.id, shop.projectId))
    const created = await shop.session.inject({
      method: 'POST',
      url: `/api/v1/tables/${shop.ordersId}/rows`,
      payload: { cells: { [shop.nameId]: 'Widget', [shop.amountId]: 1 } },
    })
    const row = created.json().row as { id: string; version: number }
    const patched = await shop.session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: { [shop.amountId]: 3 } },
    })
    expect(patched.statusCode).toBe(200)
    expect(await rowTitles(shop.session, shop.tasksId)).toEqual(['Loop A', 'Loop B'])
  })

  async function orders() {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Shop' } })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string
    const ordersTable = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Orders' } })
    const tasksTable = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Tasks' } })
    const ordersId = ordersTable.json().table.id as string
    const tasksId = tasksTable.json().table.id as string
    const nameId = columnId(await session.inject({ method: 'POST', url: `/api/v1/tables/${ordersId}/columns`, payload: { name: 'Name', type: 'text' } }))
    const statusId = columnId(await session.inject({ method: 'POST', url: `/api/v1/tables/${ordersId}/columns`, payload: { name: 'Status', type: 'select' } }))
    const openId = (await session.inject({ method: 'POST', url: `/api/v1/columns/${statusId}/options`, payload: { label: 'Open' } })).json().option.id as string
    const holdId = (await session.inject({ method: 'POST', url: `/api/v1/columns/${statusId}/options`, payload: { label: 'Hold' } })).json().option.id as string
    const amountId = columnId(await session.inject({ method: 'POST', url: `/api/v1/tables/${ordersId}/columns`, payload: { name: 'Amount', type: 'number' } }))
    const paidId = columnId(await session.inject({ method: 'POST', url: `/api/v1/tables/${ordersId}/columns`, payload: { name: 'Paid', type: 'checkbox' } }))
    const taskNameId = columnId(await session.inject({ method: 'POST', url: `/api/v1/tables/${tasksId}/columns`, payload: { name: 'Name', type: 'text' } }))
    const link = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tasksId}/relations`,
      payload: { toTableId: ordersId, cardinality: 'many_to_one', name: 'Order' },
    })
    expect(link.statusCode).toBe(200)
    return {
      session,
      projectId,
      ordersId,
      tasksId,
      nameId,
      statusId,
      openId,
      holdId,
      amountId,
      paidId,
      taskNameId,
      linkId: link.json().relation.column.id as string,
      relationId: link.json().relation.id as string,
    }
  }

  async function crm() {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    expect(project.statusCode).toBe(200)
    return { session, projectId: project.json().project.id as string }
  }
})

type Named = { id: string; name: string; activity?: boolean }

async function tableList(session: ApiSession, projectId: string) {
  const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
  expect(listed.statusCode).toBe(200)
  return listed.json().tables as Named[]
}

function idOf(tables: Named[], name: string) {
  const table = tables.find((item) => item.name === name)
  if (!table) throw new Error(`Missing ${name}`)
  return table.id
}

function column(table: { columns: { id: string; name: string; options?: { id: string; label: string }[] }[] }, name: string) {
  const found = table.columns.find((item) => item.name === name)
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

async function firstDeal(session: ApiSession, tables: Named[]) {
  const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Deals')}/rows` })
  return rows.json().rows[0] as { id: string; version: number }
}

function activityTitles(body: { activity?: { title?: string }[] }) {
  return (body.activity ?? []).map((item) => item.title).filter(Boolean)
}

type Shop = {
  session: ApiSession
  projectId: string
  ordersId: string
  tasksId: string
  nameId: string
  statusId: string
  openId: string
  holdId: string
  amountId: string
  paidId: string
  taskNameId: string
  linkId: string
  relationId: string
}

function columnId(response: { json: () => { column: { id: string } } }) {
  return response.json().column.id
}

async function saveFlows(shop: Shop, flows: AutomationFlow[]) {
  const saved = await shop.session.inject({
    method: 'PUT',
    url: `/api/v1/projects/${shop.projectId}/automations`,
    payload: { rules: [], flows },
  })
  expect(saved.statusCode, JSON.stringify(saved.json())).toBe(200)
}

async function rowTitles(session: ApiSession, tableId: string) {
  const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
  return (rows.json().rows as { title: string }[]).map((row) => row.title)
}

function at(x: number, y = 0) {
  return { x, y }
}

function onCreate(shop: Shop): AutomationFlow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    name: 'On create',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'row_created', columnId: shop.nameId, position: at(0) },
      {
        id: 'make',
        type: 'action',
        action: 'create',
        tableId: shop.tasksId,
        linkColumnId: null,
        fields: [{ columnId: shop.taskNameId, value: { kind: 'template', template: 'Task for {{label}}' } }],
        position: at(240),
      },
    ],
    edges: [{ id: 'to-make', source: 'start', target: 'make', when: null }],
  }
}

function onDelete(shop: Shop): AutomationFlow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    name: 'On delete',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'row_deleted', columnId: shop.nameId, position: at(0) },
      {
        id: 'make',
        type: 'action',
        action: 'create',
        tableId: shop.tasksId,
        linkColumnId: null,
        fields: [{ columnId: shop.taskNameId, value: { kind: 'template', template: 'Removed {{label}}' } }],
        position: at(240),
      },
    ],
    edges: [{ id: 'to-make', source: 'start', target: 'make', when: null }],
  }
}

function paidPaths(shop: Shop): AutomationFlow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    name: 'Paid',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'column_changed', columnId: shop.paidId, position: at(0) },
      { id: 'check', type: 'condition', columnId: shop.paidId, op: 'is_true', value: null, position: at(220) },
      actionNode('yes-row', shop, 'Yes row', 0),
      actionNode('no-row', shop, 'No row', 160),
    ],
    edges: [
      { id: 'to-check', source: 'start', target: 'check', when: null },
      { id: 'to-yes', source: 'check', target: 'yes-row', when: 'yes' },
      { id: 'to-no', source: 'check', target: 'no-row', when: 'no' },
    ],
  }
}

function statusPaths(shop: Shop): AutomationFlow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    name: 'Status',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'column_changed', columnId: shop.statusId, position: at(0) },
      {
        id: 'branch',
        type: 'switch',
        columnId: shop.statusId,
        cases: [{ id: 'open-case', optionIds: [shop.openId] }],
        position: at(220),
      },
      actionNode('case-row', shop, 'Case row', 0),
      actionNode('else-row', shop, 'Else row', 160),
    ],
    edges: [
      { id: 'to-branch', source: 'start', target: 'branch', when: null },
      { id: 'to-case', source: 'branch', target: 'case-row', when: 'open-case' },
      { id: 'to-else', source: 'branch', target: 'else-row', when: 'else' },
    ],
  }
}

function updates(shop: Shop): AutomationFlow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
    name: 'Updates',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'column_changed', columnId: shop.amountId, position: at(0) },
      {
        id: 'source',
        type: 'action',
        action: 'update_source',
        tableId: shop.ordersId,
        linkColumnId: null,
        fields: [{ columnId: shop.nameId, value: { kind: 'literal', value: 'Source row' } }],
        position: at(220),
      },
      {
        id: 'linked',
        type: 'action',
        action: 'update_linked',
        tableId: shop.tasksId,
        linkColumnId: shop.linkId,
        fields: [{ columnId: shop.taskNameId, value: { kind: 'literal', value: 'Linked row' } }],
        position: at(440),
      },
      {
        id: 'make',
        type: 'action',
        action: 'create',
        tableId: shop.tasksId,
        linkColumnId: null,
        fields: [
          { columnId: shop.taskNameId, value: { kind: 'literal', value: 'Draft' } },
          { columnId: shop.linkId, value: { kind: 'template', template: '{{row}}' } },
        ],
        position: at(660),
      },
      {
        id: 'created',
        type: 'action',
        action: 'update_created',
        tableId: shop.tasksId,
        linkColumnId: null,
        fields: [{ columnId: shop.taskNameId, value: { kind: 'literal', value: 'Created row' } }],
        position: at(880),
      },
    ],
    edges: [
      { id: 'to-source', source: 'start', target: 'source', when: null },
      { id: 'to-linked', source: 'source', target: 'linked', when: null },
      { id: 'to-make', source: 'linked', target: 'make', when: null },
      { id: 'to-created', source: 'make', target: 'created', when: null },
    ],
  }
}

function quietFlows(shop: Shop): AutomationFlow[] {
  const disabled: AutomationFlow = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
    name: 'Off',
    enabled: false,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'column_changed', columnId: shop.amountId, position: at(0) },
      actionNode('make', shop, 'Disabled task', 0),
    ],
    edges: [{ id: 'to-make', source: 'start', target: 'make', when: null }],
  }
  const otherTable: AutomationFlow = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
    name: 'Other table',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.tasksId, event: 'column_changed', columnId: shop.taskNameId, position: at(0) },
      actionNode('make', shop, 'Other table', 0),
    ],
    edges: [{ id: 'to-make', source: 'start', target: 'make', when: null }],
  }
  const otherColumn: AutomationFlow = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
    name: 'Other column',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'column_changed', columnId: shop.nameId, position: at(0) },
      actionNode('make', shop, 'Other column', 0),
    ],
    edges: [{ id: 'to-make', source: 'start', target: 'make', when: null }],
  }
  return [disabled, otherTable, otherColumn]
}

function cycle(shop: Shop): AutomationFlow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',
    name: 'Cycle',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: shop.ordersId, event: 'column_changed', columnId: shop.amountId, position: at(0) },
      actionNode('loop-a', shop, 'Loop A', 0),
      actionNode('loop-b', shop, 'Loop B', 160),
    ],
    edges: [
      { id: 'to-a', source: 'start', target: 'loop-a', when: null },
      { id: 'to-b', source: 'loop-a', target: 'loop-b', when: null },
      { id: 'back', source: 'loop-b', target: 'loop-a', when: null },
    ],
  }
}

function actionNode(id: string, shop: Shop, title: string, y: number): AutomationFlow['nodes'][number] {
  return {
    id,
    type: 'action',
    action: 'create',
    tableId: shop.tasksId,
    linkColumnId: null,
    fields: [{ columnId: shop.taskNameId, value: { kind: 'literal', value: title } }],
    position: at(440, y),
  }
}

async function taskTitles(session: ApiSession, tables: Named[]) {
  const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Tasks')}/rows` })
  return (rows.json().rows as { title: string }[]).map((row) => row.title)
}

function statusFlow(
  dealsId: string,
  tasksId: string,
  healthId: string,
  nameId: string,
  openId: string,
  wonId: string,
): AutomationFlow {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Health',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: dealsId, event: 'column_changed', columnId: healthId, position: { x: 0, y: 0 } },
      {
        id: 'branch',
        type: 'switch',
        columnId: healthId,
        cases: [
          { id: 'open', optionIds: [openId] },
          { id: 'won', optionIds: [wonId] },
        ],
        position: { x: 200, y: 0 },
      },
      {
        id: 'open-task',
        type: 'action',
        action: 'create',
        tableId: tasksId,
        linkColumnId: null,
        fields: [{ columnId: nameId, value: { kind: 'literal', value: 'Status Open' } }],
        position: { x: 400, y: 0 },
      },
      {
        id: 'won-task',
        type: 'action',
        action: 'create',
        tableId: tasksId,
        linkColumnId: null,
        fields: [{ columnId: nameId, value: { kind: 'literal', value: 'Status Won' } }],
        position: { x: 400, y: 160 },
      },
    ],
    edges: [
      { id: 'to-branch', source: 'start', target: 'branch', when: null },
      { id: 'to-open', source: 'branch', target: 'open-task', when: 'open' },
      { id: 'to-won', source: 'branch', target: 'won-task', when: 'won' },
    ],
  }
}

function checkboxFlow(tasksId: string, doneId: string, nameId: string): AutomationFlow {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Done',
    enabled: true,
    nodes: [
      { id: 'start', type: 'trigger', tableId: tasksId, event: 'column_changed', columnId: doneId, position: { x: 0, y: 0 } },
      { id: 'check', type: 'condition', columnId: doneId, op: 'is_true', value: null, position: { x: 200, y: 0 } },
      {
        id: 'make',
        type: 'action',
        action: 'create',
        tableId: tasksId,
        linkColumnId: null,
        fields: [{ columnId: nameId, value: { kind: 'literal', value: 'Box on' } }],
        position: { x: 400, y: 0 },
      },
    ],
    edges: [
      { id: 'to-check', source: 'start', target: 'check', when: null },
      { id: 'to-make', source: 'check', target: 'make', when: 'yes' },
    ],
  }
}

async function changeStage(session: ApiSession, tables: Named[], label: string, version?: number) {
  const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Deals')}` })
  const stage = column(detail.json().table, 'Stage')
  const option = stage.options?.find((item) => item.label === label)
  const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Deals')}/rows` })
  const deal = rows.json().rows[0] as { id: string; version: number }
  const patched = await session.inject({
    method: 'PATCH',
    url: `/api/v1/rows/${deal.id}`,
    payload: { version: version ?? deal.version, cells: { [stage.id]: option?.id } },
  })
  expect(patched.statusCode).toBe(200)
  return { dealId: deal.id, version: patched.json().row.version as number }
}
