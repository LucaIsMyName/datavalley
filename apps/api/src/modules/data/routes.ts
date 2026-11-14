import type { FastifyInstance } from 'fastify'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { registerPlatformRoutes } from '../platform/routes.js'
import { registerRowRoutes } from '../rows/routes.js'
import { registerTableRoutes } from '../tables/routes.js'

export function registerDataRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  registerTableRoutes(app, db, env)
  registerRowRoutes(app, db, env)
  registerPlatformRoutes(app, db, env)
}
