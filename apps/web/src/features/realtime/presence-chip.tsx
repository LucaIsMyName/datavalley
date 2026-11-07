import type { PresencePerson } from '@datavalley/shared'
import { useTranslation } from 'react-i18next'

export function PresenceChip({
  people,
  also = false,
  className = 'absolute -top-2 left-1 z-20',
}: {
  people: PresencePerson[]
  also?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (people.length === 0) return null
  return (
    <span className={`pointer-events-none flex max-w-full gap-0.5 ${className}`}>
      {people.map((person) => (
        <span
          key={person.userId}
          className="max-w-28 truncate rounded-sm px-1 text-[10px] leading-4 text-white"
          style={{ backgroundColor: person.color }}
        >
          {person.username}
          {also && person.editing ? ` · ${t('alsoEditing')}` : ''}
        </span>
      ))}
    </span>
  )
}

export function remoteRing(people: PresencePerson[], active: boolean) {
  if (active || people.length === 0) return undefined
  return people.map((person) => `inset 0 0 0 2px ${person.color}`).join(', ')
}
