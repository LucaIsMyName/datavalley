import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dataConnectors, formulas, permissionGrants, tableCells } from '../../database/schema.js'
import { eq } from 'drizzle-orm'
import type { Subject } from '../../security/subject.js'
import { ApiSession, createHarness, createUser, login, userByName, type Harness } from '../../test/harness.js'
import { setConnectorFetchForTests } from './connector-draft.js'
import { setCompleteForTests } from './providers/complete.js'
import type { Complete } from './providers/types.js'
import { emptyEffects, runTool } from './tools/registry.js'

const password = 'correct horse battery'

describe('organization AI', () => {
  let harness: Harness
  let admin: ApiSession
  let member: ApiSession

  beforeAll(async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bob',
      email: 'bob@example.com',
      password,
      role: 'user',
    })
    admin = await new ApiSession(harness.app).prepare()
    member = await new ApiSession(harness.app).prepare()
    expect((await login(admin, 'ada', password)).statusCode).toBe(200)
    expect((await login(member, 'bob', password)).statusCode).toBe(200)
  })

  afterEach(() => {
    setCompleteForTests(null)
    setConnectorFetchForTests(null)
  })

  afterAll(async () => {
    await harness?.close()
  })

  async function subject(username: string): Promise<Subject> {
    const user = await userByName(harness.db, username)
    return { kind: 'user', id: user.id, role: user.role === 'admin' ? 'admin' : 'user', source: 'web', user }
  }

  it('rejects AI base URLs that target private networks', async () => {
    const blocked = await admin.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: {
        provider: 'openai',
        model: 'gpt-4.1',
        baseUrl: 'http://169.254.169.254',
        enabled: false,
        apiKey: 'secret-key',
      },
    })
    expect(blocked.statusCode).toBe(400)
  })

  it('keeps the API key private and lets an admin activate AI', async () => {
    expect((await member.inject({ method: 'GET', url: '/api/v1/ai/settings' })).statusCode).toBe(403)
    expect((await member.inject({ method: 'GET', url: '/api/v1/ai/status' })).json()).toEqual({ enabled: false })
    const missingKey = await admin.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { provider: 'openai', model: 'gpt-4.1', enabled: true },
    })
    expect(missingKey.statusCode).toBe(400)
    const saved = await admin.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { provider: 'spacexai', model: 'grok-4.7', baseUrl: 'https://api.x.ai/v1', enabled: true, apiKey: 'secret-key' },
    })
    expect(saved.statusCode).toBe(200)
    const body = JSON.stringify(saved.json())
    expect(body).not.toContain('secret-key')
    expect(saved.json().settings).toMatchObject({ provider: 'spacexai', model: 'grok-4.7', enabled: true, hasApiKey: true })
    const kept = await admin.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { provider: 'spacexai', model: 'grok-4.7', baseUrl: 'https://api.x.ai/v1', enabled: true },
    })
    expect(kept.json().settings.hasApiKey).toBe(true)
    expect((await member.inject({ method: 'GET', url: '/api/v1/ai/status' })).json()).toEqual({ enabled: true })
  })

  it('refuses chat while AI is off and answers without writing when it is on', async () => {
    await admin.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { provider: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', enabled: false },
    })
    const refused = await member.inject({
      method: 'POST',
      url: '/api/v1/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Where is Ada?' }] },
    })
    expect(refused.statusCode).toBe(403)
    await admin.inject({
      method: 'PUT',
      url: '/api/v1/ai/settings',
      payload: { provider: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', enabled: true },
    })
    const complete: Complete = async () => ({ content: 'Ada is in People.', toolCalls: [] })
    setCompleteForTests(complete)
    const answer = await member.inject({
      method: 'POST',
      url: '/api/v1/ai/chat',
      payload: { messages: [{ role: 'user', content: 'Where is Ada?' }] },
    })
    expect(answer.statusCode).toBe(200)
    expect(answer.json()).toEqual({ message: 'Ada is in People.', highlights: [], proposals: [] })
  })

  it('hides projects, tables, and rows the user cannot view and does not write proposals', async () => {
    const project = await admin.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Secret project' } })
    const projectId = project.json().project.id as string
    const created = await admin.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Vault' } })
    const tableId = created.json().table.id as string
    const column = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Code', type: 'text' },
    })
    const columnId = column.json().column.id as string
    const row = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 'secret-marker' } },
    })
    const rowId = row.json().row.id as string
    const bob = await subject('bob')
    const effects = emptyEffects()
    const projects = await runTool({ db: harness.db, subject: bob, effects }, 'list_projects', {})
    expect(JSON.stringify(projects)).not.toContain('Secret project')
    const tables = await runTool({ db: harness.db, subject: bob, effects }, 'list_tables', { projectId })
    expect(tables).toEqual({ error: expect.any(String) })
    expect(JSON.stringify(tables)).not.toContain('Vault')
    const sample = await runTool({ db: harness.db, subject: bob, effects }, 'sample_rows', { tableId })
    expect(JSON.stringify(sample)).not.toContain('secret-marker')
    const ada = await subject('ada')
    const proposal = await runTool({ db: harness.db, subject: ada, effects }, 'propose_changes', {
      tableId,
      changes: [{ rowId, columnId, value: 'changed' }],
    })
    expect(proposal).toMatchObject({ ok: true, count: 1 })
    const [cell] = await harness.db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
    expect(cell?.valueText).toBe('secret-marker')
    expect(effects.proposals).toHaveLength(1)
    expect(effects.proposals[0]).toMatchObject({ kind: 'cells' })
    const denied = await runTool({ db: harness.db, subject: bob, effects }, 'navigate', { projectId, tableId })
    expect(denied).toEqual({ error: expect.any(String) })
    expect(effects.navigation).toBeNull()
    expect(JSON.stringify(denied)).not.toContain(`/projects/${projectId}`)
    const opened = await runTool({ db: harness.db, subject: ada, effects }, 'navigate', { tableId })
    expect(opened).toEqual({ ok: true, path: `/projects/${projectId}/tables/${tableId}` })
    expect(effects.navigation).toEqual({ path: `/projects/${projectId}/tables/${tableId}` })
  })

  it('hides columns denied to the user in describe_table and sample_rows', async () => {
    const project = await admin.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Shared board' } })
    const projectId = project.json().project.id as string
    const created = await admin.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Board' } })
    const tableId = created.json().table.id as string
    const open = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Title', type: 'text' },
    })
    const hidden = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Salary', type: 'text' },
    })
    const openId = open.json().column.id as string
    const hiddenId = hidden.json().column.id as string
    const row = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [openId]: 'Public', [hiddenId]: 'secret-pay' } },
    })
    const rowId = row.json().row.id as string
    await admin.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: { userId: (await userByName(harness.db, 'bob')).id, grants: [{ action: 'view', effect: 'allow' }] },
    })
    await admin.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/members`,
      payload: { username: 'bob' },
    })
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: (await userByName(harness.db, 'bob')).id,
      resourceType: 'column',
      resourceId: hiddenId,
      action: 'view',
      effect: 'deny',
    })
    const bob = await subject('bob')
    const effects = emptyEffects()
    const described = await runTool({ db: harness.db, subject: bob, effects }, 'describe_table', { tableId })
    const columnIds = (described as { columns: { id: string }[] }).columns.map((column) => column.id)
    expect(columnIds).toContain(openId)
    expect(columnIds).not.toContain(hiddenId)
    const sample = await runTool({ db: harness.db, subject: bob, effects }, 'sample_rows', { tableId })
    const sampleJson = JSON.stringify(sample)
    expect(sampleJson).toContain('Public')
    expect(sampleJson).not.toContain('secret-pay')
    expect(sampleJson).not.toContain(hiddenId)
    expect((sample as { rows: { id: string }[] }).rows.some((item) => item.id === rowId)).toBe(true)
  })

  it('returns a formula expression without inserting a formula', async () => {
    const project = await admin.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Formulas' } })
    const projectId = project.json().project.id as string
    const created = await admin.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Numbers' } })
    const tableId = created.json().table.id as string
    const column = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const columnId = column.json().column.id as string
    const row = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 5 } },
    })
    const rowId = row.json().row.id as string
    const before = await harness.db.select({ id: formulas.id }).from(formulas)
    setCompleteForTests(async () => ({ content: '[Amount]', toolCalls: [] }))
    const suggested = await admin.inject({
      method: 'POST',
      url: '/api/v1/ai/formula',
      payload: { prompt: 'Show the amount', tableId, columnId, rowId },
    })
    expect(suggested.statusCode).toBe(200)
    expect(suggested.json().expression).toBe('[Amount]')
    const after = await harness.db.select({ id: formulas.id }).from(formulas)
    expect(after).toEqual(before)
  })

  it('returns a connector draft without inserting a connector', async () => {
    const before = await harness.db.select({ id: dataConnectors.id }).from(dataConnectors)
    setConnectorFetchForTests(async () => JSON.stringify([{ id: '1', name: 'Ada' }]))
    setCompleteForTests(async () => ({
      content: JSON.stringify({
        name: 'People feed',
        format: 'json',
        recordsPath: '',
        externalIdPath: 'id',
        fields: [{ sourceKey: 'name', targetFieldKey: 'name', targetLabel: 'Name' }],
      }),
      toolCalls: [],
    }))
    const drafted = await admin.inject({
      method: 'POST',
      url: '/api/v1/ai/connectors/draft',
      payload: { prompt: 'Import people', url: 'https://example.com/people.json' },
    })
    expect(drafted.statusCode).toBe(200)
    expect(drafted.json().draft).toMatchObject({
      name: 'People feed',
      format: 'json',
      fields: [{ sourceKey: 'name', targetFieldKey: 'name', targetLabel: 'Name' }],
    })
    const after = await harness.db.select({ id: dataConnectors.id }).from(dataConnectors)
    expect(after).toEqual(before)
  })
})
