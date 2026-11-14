export function sendPdf(
  reply: { header: (name: string, value: string) => void; send: (body: Buffer) => unknown },
  file: { name: string; body: Buffer },
) {
  reply.header('content-type', 'application/pdf')
  reply.header('content-disposition', `attachment; filename="${file.name}"`)
  reply.header('x-content-type-options', 'nosniff')
  return reply.send(file.body)
}