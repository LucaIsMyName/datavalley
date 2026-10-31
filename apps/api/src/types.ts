import type { Grant } from '@datavalley/shared'
import type { Subject } from './security/subject.js'

declare module 'fastify' {
  interface FastifyRequest {
    subject: Subject | null
    grants: Grant[] | null
    rawBody?: string
  }
}
