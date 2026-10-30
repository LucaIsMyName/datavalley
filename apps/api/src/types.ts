import type { Subject } from './security/subject.js'

declare module 'fastify' {
  interface FastifyRequest {
    subject: Subject | null
    rawBody?: string
  }
}
