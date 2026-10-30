import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { loadEnv } from '../apps/api/src/config/env.ts'
import { createDatabase } from '../apps/api/src/database/client.ts'
import { organizations, users } from '../apps/api/src/database/schema.ts'
import { assertPassword, hashPassword } from '../apps/api/src/security/passwords.ts'

for (const path of ['.env', '../.env']) {
  if (existsSync(path)) process.loadEnvFile(path)
}

const env = loadEnv()
assertPassword(env.INITIAL_ADMIN_PASSWORD, env.INITIAL_ADMIN_USERNAME)
const database = await createDatabase(env)
const existing = await database.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1)
if (existing.length > 0) {
  console.error('An administrator already exists. Refusing to create another.')
  await database.close()
  process.exit(1)
}
const [organization] = await database.db.select().from(organizations).limit(1)
const org = organization ?? (await database.db.insert(organizations).values({ name: 'Default' }).returning())[0]
await database.db.insert(users).values({
  organizationId: org.id,
  username: env.INITIAL_ADMIN_USERNAME.toLowerCase(),
  email: env.INITIAL_ADMIN_EMAIL.toLowerCase(),
  passwordHash: await hashPassword(env.INITIAL_ADMIN_PASSWORD, env),
  role: 'admin',
  mustChangePassword: true,
})
console.log(`Created administrator ${env.INITIAL_ADMIN_USERNAME}`)
await database.close()
