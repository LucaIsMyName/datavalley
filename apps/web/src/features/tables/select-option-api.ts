import { api } from '../../lib/api'
import type { ColumnOption } from './select-options-utils'

export async function postColumnOption(columnId: string, label: string) {
  return api.request<{ option: ColumnOption }>(`/columns/${columnId}/options`, {
    method: 'POST',
    body: JSON.stringify({ label }),
  })
}

export async function patchColumnOption(
  columnId: string,
  optionId: string,
  patch: { label?: string; color?: string; position?: string },
) {
  return api.request<{ option: ColumnOption }>(`/columns/${columnId}/options/${optionId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteColumnOptionApi(columnId: string, optionId: string) {
  return api.request<{ ok: true }>(`/columns/${columnId}/options/${optionId}`, { method: 'DELETE' })
}
