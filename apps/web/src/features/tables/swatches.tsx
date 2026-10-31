import { paintSwatch, SWATCH_NAMES, swatchName, type SwatchRole } from '@datavalley/shared'
import { useTranslation } from 'react-i18next'

export function Swatches({
  role,
  value,
  label,
  onPick,
}: {
  role: SwatchRole
  value?: string | null
  label?: string
  onPick: (color: string | null) => void
}) {
  const { t } = useTranslation()
  const selected = swatchName(value)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SWATCH_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          aria-label={label ? `${label} ${t(`color_${name}`)}` : t(`color_${name}`)}
          aria-pressed={selected === name}
          className={`grid h-6 w-6 place-items-center border border-border text-xs font-semibold ${selected === name ? 'ring-2 ring-foreground' : ''}`}
          style={
            role === 'text'
              ? { color: paintSwatch(name, 'text'), background: 'var(--card)' }
              : { background: paintSwatch(name, 'background') }
          }
          onClick={() => onPick(name)}
        >
          {role === 'text' ? 'A' : null}
        </button>
      ))}
      <button
        type="button"
        className="px-1 text-sm text-muted-foreground"
        aria-label={label ? `${label} ${t('clearColor')}` : undefined}
        onClick={() => onPick(null)}
      >
        {t('clearColor')}
      </button>
    </div>
  )
}
