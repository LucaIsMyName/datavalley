import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

type Field = {
  id: string
  name: string
  type: string
  options: { id: string; label: string }[]
}

export function PublicFormPage() {
  const { token = '' } = useParams()
  const [tableName, setTableName] = useState('')
  const [fields, setFields] = useState<Field[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const [missing, setMissing] = useState(false)
  const [website, setWebsite] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/v1/public/forms/${token}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('missing')
        return response.json() as Promise<{ tableName: string; fields: Field[] }>
      })
      .then((body) => {
        if (cancelled) return
        setTableName(body.tableName)
        setFields(body.fields)
        document.title = body.tableName
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    const cells: Record<string, unknown> = {}
    for (const field of fields) {
      const value = values[field.id]
      if (field.type === 'checkbox') cells[field.id] = value === true
      else if (typeof value === 'string' && value.trim()) cells[field.id] = field.type === 'number' ? Number(value) : value
    }
    try {
      const response = await fetch(`/api/v1/public/forms/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cells, website }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        setError(body?.error?.message || 'Could not send the form')
        return
      }
      setDone(true)
    } catch {
      setError('Could not send the form')
    } finally {
      setPending(false)
    }
  }

  if (missing) return <p className="p-6 text-sm">This form is not available.</p>
  if (done) return <p className="p-6 text-sm">Sent. Thank you.</p>

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{tableName || 'Form'}</h1>
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        {fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <Label htmlFor={field.id}>{field.name}</Label>
            {field.type === 'long_text' ? (
              <textarea
                id={field.id}
                className="min-h-24 border border-border bg-card px-3 py-2 text-sm"
                value={typeof values[field.id] === 'string' ? (values[field.id] as string) : ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
              />
            ) : field.type === 'checkbox' ? (
              <input
                id={field.id}
                type="checkbox"
                className="size-4"
                checked={values[field.id] === true}
                onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.checked }))}
              />
            ) : field.type === 'select' ? (
              <select
                id={field.id}
                className="h-9 border border-border bg-card px-2 text-sm"
                value={typeof values[field.id] === 'string' ? (values[field.id] as string) : ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
              >
                <option value="">Choose</option>
                {field.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={field.id}
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'mail' ? 'email' : 'text'}
                value={typeof values[field.id] === 'string' ? (values[field.id] as string) : ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
              />
            )}
          </div>
        ))}
        {/* Honeypot: hidden from people and assistive technology; bots that fill every field get rejected. */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor="form-website">Website</label>
          <input
            id="form-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || fields.length === 0}>
          Send
        </Button>
      </form>
    </main>
  )
}
