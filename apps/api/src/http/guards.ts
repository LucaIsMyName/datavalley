import type { FastifyRequest } from 'fastify'
import { AppError, unauthorized } from '../errors.js'
import type { Subject } from '../security/subject.js'

export function requireSubject(request: FastifyRequest): Subject {
  if (!request.subject) throw unauthorized()
  return request.subject
}

export function requireAdmin(request: FastifyRequest): Subject {
  const subject = requireSubject(request)
  if (subject.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  return subject
}

export function requireUserSubject(request: FastifyRequest): Subject {
  const subject = requireSubject(request)
  if (!subject.user) throw unauthorized()
  return subject
}