import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ErrorState, LoadingBlock } from '../../components/states'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'

type Quote = {
  title: string
  status: string
  customer: string
  total: number
  lines: { product: string; quantity: number; price: number; amount: number }[]
}

export function QuotePrintPage() {
  const { projectId = '', tableId = '', rowId = '' } = useParams()
  const { t } = useTranslation()
  const quote = useQuery({
    queryKey: ['quote', rowId],
    retry: false,
    queryFn: () => api.request<Quote>(`/rows/${rowId}/quote`),
  })
  if (quote.isLoading) return <LoadingBlock />
  if (quote.isError || !quote.data) return <ErrorState message={(quote.error as Error | null)?.message ?? t('error')} />
  const data = quote.data
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 print:max-w-none">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link to={`/projects/${projectId}/tables/${tableId}/rows/${rowId}`} className="text-sm text-primary underline">
          {t('backToRecord')}
        </Link>
        <Button type="button" onClick={() => window.print()}>
          {t('printQuote')}
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">{data.title}</h1>
      <p className="text-sm">
        {data.customer}
        {data.status ? ` · ${data.status}` : ''}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 font-medium">{t('quoteProduct')}</th>
            <th className="py-2 font-medium">{t('quoteQuantity')}</th>
            <th className="py-2 font-medium">{t('quotePrice')}</th>
            <th className="py-2 font-medium">{t('quoteAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line) => (
            <tr key={`${line.product}-${line.quantity}`} className="border-b border-border">
              <td className="py-2">{line.product}</td>
              <td className="py-2">{line.quantity}</td>
              <td className="py-2">{line.price}</td>
              <td className="py-2">{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-base font-semibold">
        {t('quoteTotal')} {data.total}
      </p>
    </main>
  )
}
