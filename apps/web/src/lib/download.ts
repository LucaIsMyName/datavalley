/** Downloads an API file. The JSON client cannot read a PDF body. */
export async function downloadFile(path: string, fallbackName: string) {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include' })
  if (!response.ok) {
    let message = 'Download failed'
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // The error body is not JSON.
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const header = response.headers.get('content-disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(header)
  const name = match?.[1] || fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
