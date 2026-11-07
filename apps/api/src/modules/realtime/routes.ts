import { filterRealtimeEvent, presenceColor, type PresenceFocus, type PresencePerson, type RealtimeEvent } from '@datavalley/shared'
import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import type { AppDatabase } from '../../database/client.js'
import { notFound, unauthorized } from '../../errors.js'
import { allows, assertCan, loadGrants } from '../../security/access.js'
import { getRealtimeHub } from './hub.js'

const uuid = Type.String({ minLength: 36, maxLength: 36 })

const presenceBody = Type.Object({
  clear: Type.Optional(Type.Boolean()),
  tableId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  tableName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  editing: Type.Optional(Type.Boolean()),
  draft: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  focus: Type.Optional(
    Type.Union([
      Type.Object({
        kind: Type.Union([
          Type.Literal('cell'),
          Type.Literal('projectName'),
          Type.Literal('projectDescription'),
          Type.Literal('tableName'),
          Type.Literal('columnName'),
          Type.Literal('notes'),
          Type.Literal('formula'),
        ]),
        tableId: Type.Optional(Type.String()),
        rowId: Type.Optional(Type.String()),
        columnId: Type.Optional(Type.String()),
      }),
      Type.Null(),
    ]),
  ),
})

const projectParams = Type.Object({ id: uuid })

function focusFrom(value: unknown): PresenceFocus | null {
  if (!value || typeof value !== 'object') return null
  const focus = value as PresenceFocus
  if (focus.kind === 'projectName' || focus.kind === 'projectDescription') return { kind: focus.kind }
  if (!('tableId' in focus) || typeof focus.tableId !== 'string' || !focus.tableId) return null
  if (focus.kind === 'tableName') return { kind: 'tableName', tableId: focus.tableId }
  if (focus.kind === 'notes' && typeof focus.rowId === 'string') return { kind: 'notes', tableId: focus.tableId, rowId: focus.rowId }
  if (focus.kind === 'cell' && typeof focus.columnId === 'string' && typeof focus.rowId === 'string') {
    return { kind: 'cell', tableId: focus.tableId, rowId: focus.rowId, columnId: focus.columnId }
  }
  if (focus.kind === 'columnName' && typeof focus.columnId === 'string') {
    return { kind: 'columnName', tableId: focus.tableId, columnId: focus.columnId }
  }
  if (focus.kind === 'formula' && typeof focus.columnId === 'string') {
    return { kind: 'formula', tableId: focus.tableId, columnId: focus.columnId, rowId: typeof focus.rowId === 'string' ? focus.rowId : undefined }
  }
  return null
}

export function registerRealtimeRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get('/projects/:id/events', { schema: { params: projectParams } }, async (request, reply) => {
    if (!request.subject?.user) throw unauthorized()
    const hub = getRealtimeHub()
    if (!hub) throw notFound()
    const projectId = (request.params as { id: string }).id
    await assertCan(db, request.subject, 'view', { type: 'project', id: projectId })
    const grants = await loadGrants(db, request.subject)
    const subject = request.subject
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (event: RealtimeEvent) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return
      reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
    }
    const viewer = {
      id: crypto.randomUUID(),
      userId: subject.id,
      canViewTable: (tableId: string) =>
        allows(subject, grants, 'view', { type: 'table', id: tableId, parents: { project: projectId } }),
      canViewColumn: (tableId: string, columnId: string) =>
        allows(subject, grants, 'view', { type: 'column', id: columnId, parents: { table: tableId, project: projectId } }),
      send,
    }
    const lastId = request.headers['last-event-id']
    for (const event of hub.since(projectId, typeof lastId === 'string' ? lastId : undefined)) {
      const filtered = filterRealtimeEvent(event, viewer)
      if (filtered) send(filtered)
    }
    const snapshot = filterRealtimeEvent(
      {
        id: 'presence',
        type: 'presence',
        actorId: subject.id,
        projectId,
        upsert: hub.people(projectId),
        remove: [],
      },
      viewer,
    )
    if (snapshot?.type === 'presence' && snapshot.upsert.length && !reply.raw.writableEnded) {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`)
    }
    const unsubscribe = hub.subscribe(projectId, viewer)
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n')
    }, 15_000)
    heartbeat.unref?.()
    const close = () => {
      clearInterval(heartbeat)
      unsubscribe()
    }
    request.raw.on('close', close)
    reply.raw.on('error', close)
  })

  app.post('/projects/:id/presence', { schema: { params: projectParams, body: presenceBody } }, async (request) => {
    if (!request.subject?.user) throw unauthorized()
    const hub = getRealtimeHub()
    if (!hub) throw notFound()
    const projectId = (request.params as { id: string }).id
    await assertCan(db, request.subject, 'view', { type: 'project', id: projectId })
    const body = request.body as {
      clear?: boolean
      tableId?: string | null
      tableName?: string | null
      editing?: boolean
      draft?: string | null
      focus?: unknown
    }
    if (body.clear) {
      hub.clearPresence(projectId, request.subject.id)
      return { ok: true }
    }
    const draft = typeof body.draft === 'string' ? body.draft.slice(0, 2_000) : null
    const person: PresencePerson = {
      userId: request.subject.id,
      username: request.subject.user.username,
      color: presenceColor(request.subject.id),
      tableId: body.tableId ?? null,
      tableName: body.tableName ?? null,
      focus: focusFrom(body.focus),
      editing: Boolean(body.editing),
      draft,
    }
    hub.setPresence(projectId, person)
    return { ok: true }
  })
}
