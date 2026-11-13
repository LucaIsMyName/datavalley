import { generateKeyBetween } from 'fractional-indexing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testEnv } from '../../config/env.js'
import { createDatabase, type AppDatabase } from '../../database/client.js'
import { organizations, projects, tableStatuses, tableTags, tables, users } from '../../database/schema.js'
import { hashPassword } from '../../security/passwords.js'
import { displayLabels } from './history.js'

let db: AppDatabase
let close: () => Promise<void>
let userId = ''
let homeStatusId = ''
let otherStatusId = ''
let homeTagId = ''
let otherTagId = ''

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
  userId = user.id
  const [project] = await db
    .insert(projects)
    .values({ organizationId: org.id, name: 'Labels', createdBy: user.id })
    .returning()
  const [home] = await db
    .insert(tables)
    .values({ projectId: project.id, name: 'Deals', createdBy: user.id, position: generateKeyBetween(null, null) })
    .returning()
  const [other] = await db
    .insert(tables)
    .values({
      projectId: project.id,
      name: 'Archive',
      createdBy: user.id,
      position: generateKeyBetween(home.position, null),
    })
    .returning()
  const [homeStatus] = await db
    .insert(tableStatuses)
    .values({ tableId: home.id, name: 'Open', color: 'green', position: generateKeyBetween(null, null) })
    .returning()
  const [otherStatus] = await db
    .insert(tableStatuses)
    .values({ tableId: other.id, name: 'Closed', color: 'slate', position: generateKeyBetween(null, null) })
    .returning()
  const [homeTag] = await db.insert(tableTags).values({ tableId: home.id, name: 'Hot', color: 'red' }).returning()
  const [otherTag] = await db.insert(tableTags).values({ tableId: other.id, name: 'Cold', color: 'blue' }).returning()
  homeStatusId = homeStatus.id
  otherStatusId = otherStatus.id
  homeTagId = homeTag.id
  otherTagId = otherTag.id
  return home.id
}

const columns = [
  { id: 'status', type: 'status' },
  { id: 'tags', type: 'tags' },
  { id: 'owner', type: 'user' },
]

describe('displayLabels', () => {
  let homeTableId = ''

  beforeAll(async () => {
    homeTableId = await seed()
  })

  afterAll(async () => {
    await close?.()
  })

  it('resolves names from one row and from several cell records', async () => {
    const oneRow = await displayLabels(db, columns, {
      status: homeStatusId,
      tags: [homeTagId],
      owner: [userId],
    })
    expect(oneRow.get(homeStatusId)).toBe('Open')
    expect(oneRow.get(homeTagId)).toBe('Hot')
    expect(oneRow.get(userId)).toBe('ada')

    const acrossCells = await displayLabels(db, columns, [
      { status: otherStatusId },
      { tags: [otherTagId] },
    ])
    expect(acrossCells.get(otherStatusId)).toBe('Closed')
    expect(acrossCells.get(otherTagId)).toBe('Cold')
    expect(acrossCells.has(homeStatusId)).toBe(false)
  })

  it('leaves another table’s status and tag unlabeled when history scopes the lookup', async () => {
    const labels = await displayLabels(
      db,
      columns,
      { status: otherStatusId, tags: [otherTagId], owner: [userId] },
      { tableId: homeTableId },
    )
    expect(labels.has(otherStatusId)).toBe(false)
    expect(labels.has(otherTagId)).toBe(false)
    expect(labels.get(userId)).toBe('ada')
    expect(labels.has(homeStatusId)).toBe(false)
  })
})
