import { STAGE_FOLLOW_UP_RULE_ID, builtinStageRule, type CustomAutomationRule } from '@datavalley/shared'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('stops the built-in follow-up when that rule is turned off', async () => {
    const { session, projectId } = await crm()
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false)] },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().rules).toEqual([builtinStageRule(false)])
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
    expect(listed.json().rules[0].id).toBe(STAGE_FOLLOW_UP_RULE_ID)
    const denied = await bea.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/automations`,
      payload: { rules: [builtinStageRule(false)] },
    })
    expect(denied.statusCode).toBe(404)
  })

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

async function taskTitles(session: ApiSession, tables: Named[]) {
  const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${idOf(tables, 'Tasks')}/rows` })
  return (rows.json().rows as { title: string }[]).map((row) => row.title)
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
