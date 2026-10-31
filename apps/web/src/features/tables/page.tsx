import { useParams } from 'react-router'
import { TableScreen } from './grid'

export function TablePage() {
  const { tableId = '' } = useParams()
  return <TableScreen tableId={tableId} />
}
