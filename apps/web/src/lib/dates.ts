import { de, enUS, type Locale } from 'date-fns/locale'

export function calendarLocale(language: string): Locale {
  return language.startsWith('de') ? de : enUS
}

export function toDateOnlyString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateOnly(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function splitDatetime(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' }
  if (value.includes('T')) {
    return { date: value.slice(0, 10), time: value.slice(11, 16) }
  }
  return { date: value, time: '' }
}
