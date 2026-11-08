export function applyMailPlaceholders(template: string, fields: Record<string, string>) {
  const entries = Object.entries(fields)
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, raw: string) => {
    const name = raw.trim().toLowerCase()
    const found = entries.find(([key]) => key.trim().toLowerCase() === name)
    return found ? found[1] : match
  })
}
