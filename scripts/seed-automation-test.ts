import { existsSync } from 'node:fs'
import { projectOwnerActions } from '@datavalley/shared'
import { eq } from 'drizzle-orm'
import { createDatabase } from '../apps/api/src/database/client.js'
import { permissionGrants, projectMembers, projects, users } from '../apps/api/src/database/schema.js'
import { loadEnv } from '../apps/api/src/config/env.js'
import { seedAutomationTest } from '../apps/api/src/modules/tables/template.js'

if (existsSync('.env.development')) process.loadEnvFile('.env.development')

const database = await createDatabase(loadEnv())
const existing = await database.db.select({ id: projects.id }).from(projects).where(eq(projects.name, 'Automation Test')).limit(1)
if (existing.length > 0) {
  console.log('Automation Test project already exists')
  await database.close()
  process.exit(0)
}

const [owner] = await database.db.select().from(users).orderBy(users.createdAt).limit(1)
if (!owner) throw new Error('Create an account before seeding the Automation Test project')
const [project] = await database.db
  .insert(projects)
  .values({ organizationId: owner.organizationId, name: 'Automation Test', createdBy: owner.id })
  .returning()
const members = await database.db.select().from(users).where(eq(users.organizationId, owner.organizationId))
await database.db.insert(projectMembers).values(members.map((member) => ({ projectId: project.id, userId: member.id })))
await database.db.insert(permissionGrants).values(
  members.flatMap((member) =>
    projectOwnerActions.map((action) => ({
      subjectType: 'user' as const,
      subjectId: member.id,
      resourceType: 'project' as const,
      resourceId: project.id,
      action,
      effect: 'allow' as const,
    })),
  ),
)
await seedAutomationTest(database.db, project.id, owner.id)
console.log('Seeded Automation Test')
await database.close()
