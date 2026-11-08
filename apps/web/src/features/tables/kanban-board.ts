export type KanbanLane = {
  id: string
  label: string
  rowIds: string[]
}

export function kanbanLanes(
  rows: { id: string; status: string | null }[],
  options: { id: string; label: string }[],
  statusOrder: string[],
): KanbanLane[] {
  const known = new Set(options.map((option) => option.id))
  const ordered = [
    ...statusOrder.filter((id) => known.has(id)),
    ...options.map((option) => option.id).filter((id) => !statusOrder.includes(id)),
  ]
  const lanes = new Map<string, KanbanLane>(
    ordered.map((id) => [
      id,
      { id, label: options.find((option) => option.id === id)?.label ?? id, rowIds: [] },
    ]),
  )
  const unset: KanbanLane = { id: '', label: '', rowIds: [] }
  for (const row of rows) {
    const lane = row.status ? lanes.get(row.status) : undefined
    if (lane) lane.rowIds.push(row.id)
    else unset.rowIds.push(row.id)
  }
  return [...lanes.values(), unset]
}
