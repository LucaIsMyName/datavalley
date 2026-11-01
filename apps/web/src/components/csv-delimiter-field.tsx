import { useTranslation } from 'react-i18next'
import { Input } from './ui/input'
import { SelectField } from './ui/select'

export type CsvDelimiterValue =
  | { kind: 'preset'; value: ',' | ';' | '\t' | '|' }
  | { kind: 'custom'; value: string }

export function csvDelimiterWire(value: CsvDelimiterValue): string {
  if (value.kind === 'custom') return value.value.slice(0, 1) || ','
  return value.value
}

export function defaultCsvDelimiter(): CsvDelimiterValue {
  return { kind: 'preset', value: ',' }
}

type CsvDelimiterFieldProps = {
  value: CsvDelimiterValue
  onChange: (value: CsvDelimiterValue) => void
}

export function CsvDelimiterField({ value, onChange }: CsvDelimiterFieldProps) {
  const { t } = useTranslation()
  const preset =
    value.kind === 'preset'
      ? value.value === '\t'
        ? 'tab'
        : value.value
      : 'custom'
  const customChar = value.kind === 'custom' ? value.value : ''

  return (
    <div className="flex flex-col gap-1.5">
      <SelectField
        label={t('csvDelimiter')}
        value={preset}
        onValueChange={(next) => {
          if (next === 'custom') {
            onChange({ kind: 'custom', value: customChar || '|' })
            return
          }
          if (next === 'tab') {
            onChange({ kind: 'preset', value: '\t' })
            return
          }
          onChange({ kind: 'preset', value: next as ',' | ';' | '|' })
        }}
        options={[
          { value: ',', label: t('csvDelimiterComma') },
          { value: ';', label: t('csvDelimiterSemicolon') },
          { value: 'tab', label: t('csvDelimiterTab') },
          { value: '|', label: t('csvDelimiterPipe') },
          { value: 'custom', label: t('csvDelimiterCustom') },
        ]}
      />
      {preset === 'custom' ? (
        <Input
          aria-label={t('csvDelimiterCustomChar')}
          className="max-w-[4rem]"
          maxLength={1}
          value={customChar}
          onChange={(event) => onChange({ kind: 'custom', value: event.target.value })}
        />
      ) : null}
    </div>
  )
}
