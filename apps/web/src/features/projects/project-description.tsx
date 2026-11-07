import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '@datavalley/api-client'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { reportPresence } from '../realtime/presence-store'

export function ProjectDescription({ projectId, value }: { projectId: string; value: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState(value)
  const focused = useRef(false)
  const baseline = useRef(value)
  useEffect(() => {
    if (focused.current) return
    setText(value)
    baseline.current = value
  }, [value])
  return (
    <textarea
      aria-label={t('description')}
      className="min-h-40 w-full flex-1 resize-none  border border-border bg-transparent p-2 text-sm leading-5 outline-none"
      value={text}
      placeholder={t('description')}
      onFocus={() => {
        focused.current = true
        reportPresence({ tableId: null, tableName: null, focus: { kind: 'projectDescription' }, editing: true })
      }}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        reportPresence({
          tableId: null,
          tableName: null,
          focus: { kind: 'projectDescription' },
          editing: true,
          draft: next,
        })
        sync.edit(`project:${projectId}:description`, {
          draft: next,
          delay: 300,
          apply: () => undefined,
          commit: (draft) =>
            api.request<{ project: Project }>(`/projects/${projectId}`, {
              method: 'PATCH',
              body: JSON.stringify({ description: draft }),
            }),
          accept: (result) => {
            baseline.current = result.project.description
            queryClient.setQueryData(['project', projectId], result)
          },
          rollback: () => setText(baseline.current),
        })
      }}
      onBlur={() => {
        focused.current = false
        void sync.flush(`project:${projectId}:description`)
        reportPresence({ focus: null, editing: false, draft: null, tableId: null, tableName: null })
      }}
    />
  )
}
