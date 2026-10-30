import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

function keyFrom(material: string) {
  return createHash('sha256').update(material).digest()
}

export function encryptString(material: string, plaintext: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(material), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptString(material: string, payload: string) {
  const buffer = Buffer.from(payload, 'base64url')
  const iv = buffer.subarray(0, 12)
  const tag = buffer.subarray(12, 28)
  const encrypted = buffer.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(material), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
