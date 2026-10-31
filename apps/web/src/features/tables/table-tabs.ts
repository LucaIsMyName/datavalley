export function moveTab<T extends { id: string }>(items: T[], fromId: string, toId: string) {
  const from = items.findIndex((item) => item.id === fromId)
  const to = items.findIndex((item) => item.id === toId)
  if (from < 0 || to < 0 || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (!item) return items
  next.splice(to, 0, item)
  return next
}

export function tableNameFromFile(filename: string) {
  return filename.replace(/\.csv$/i, '').trim()
}
