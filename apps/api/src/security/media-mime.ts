const allowedMime = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
])

export function allowedMediaMime(mime: string) {
  return allowedMime.has(mime)
}

function startsWith(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false
  return bytes.every((byte, index) => buffer[index] === byte)
}

function isWebp(buffer: Buffer) {
  return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
}

function isGif(buffer: Buffer) {
  return buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')
}

function isPdf(buffer: Buffer) {
  return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF'
}

function isSvg(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').trimStart()
  if (!sample.startsWith('<svg') && !sample.startsWith('<?xml')) return false
  return !/<script/i.test(sample)
}

function isTextLike(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  for (const byte of sample) {
    if (byte === 0) return false
  }
  return true
}

/** Returns a supported MIME when the buffer matches declared type, otherwise null. */
export function sniffMediaMime(buffer: Buffer, declared: string): string | null {
  const mime = declared.trim().toLowerCase()
  if (!allowedMime.has(mime)) return null
  if (mime === 'image/png') return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]) ? mime : null
  if (mime === 'image/jpeg') return startsWith(buffer, [0xff, 0xd8, 0xff]) ? mime : null
  if (mime === 'image/gif') return isGif(buffer) ? mime : null
  if (mime === 'image/webp') return isWebp(buffer) ? mime : null
  if (mime === 'application/pdf') return isPdf(buffer) ? mime : null
  if (mime === 'image/svg+xml') return isSvg(buffer) ? mime : null
  if (mime === 'text/plain' || mime === 'text/csv') return isTextLike(buffer) ? mime : null
  return null
}

export function isImageMime(mime: string) {
  return mime.startsWith('image/')
}
