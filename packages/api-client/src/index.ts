import type { ApiErrorBody, FormatRule } from '@datavalley/shared'

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | { error?: { code?: string; message?: string } },
  ) {
    super(body.error?.message ?? 'Request failed')
  }

  get code() {
    return this.body.error?.code ?? 'internal_error'
  }
}

export class DatavalleyClient {
  private csrfToken = ''

  constructor(private baseUrl = '/api/v1') {}

  async ensureCsrf() {
    const response = await this.request<{ token: string }>('/auth/csrf')
    this.csrfToken = response.token
    return response.token
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    if (init.method && init.method !== 'GET' && init.method !== 'HEAD') headers.set('csrf-token', this.csrfToken)
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, credentials: 'include' })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    if (!response.ok) throw new ApiClientError(response.status, data)
    return data as T
  }
}

export type User = {
  id: string
  username: string
  email: string
  role: string
  disabled: boolean
  mustChangePassword: boolean
  locale: string
  timezone: string
  theme: string
  createdAt: string
}

export type Project = {
  id: string
  name: string
  description: string
  icon: string
  archivedAt: string | null
  organizationId: string
}

export type CatalogItem = {
  id: string
  tableId: string
  name: string
  color: string
  position?: string
}

export type Column = {
  id: string
  name: string
  description: string
  type: string
  config: Record<string, unknown>
  position: string
  hidden: boolean
  width: number
  frozen: boolean
  options: { id: string; label: string; color: string | null; position: string }[]
  formula?: string | null
}

export type TableRecord = {
  id: string
  projectId: string
  name: string
  description: string
  icon: string
  headerConfig: Record<string, unknown>
  footerConfig: Record<string, unknown>
  formatRules: FormatRule[]
  archivedAt: string | null
  columns?: Column[]
  tags?: CatalogItem[]
  statuses?: CatalogItem[]
}

export type RowRecord = {
  id: string
  position: string
  version: number
  color: string | null
  notes: string
  rowNumber: number
  cells: Record<string, unknown>
  backgrounds: Record<string, string>
}
