import PDFDocument from 'pdfkit'

type PdfDoc = InstanceType<typeof PDFDocument>
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { projects, tableRows } from '../../database/schema.js'
import { notFound } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, resolveTableContext } from '../tables/service.js'
import { displayLabels, historyLabel } from './history.js'
import { getRecord } from './service.js'
import { quoteSummary } from './quote.js'
import { visibleColumns } from './visible-columns.js'

const ink = '#111827'
const muted = '#6b7280'
const line = '#e5e7eb'
const margin = 48

export async function recordPdf(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  const { shell, physical } = await resolveTableContext(db, subject, stored.tableId, 'view')
  const record = await getRecord(db, subject, rowId)
  const columns = await visibleColumns(
    db,
    subject,
    shell.id,
    shell.projectId,
    await loadColumns(db, physical.id),
  )
  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, shell.projectId))
    .limit(1)
  const labels = await displayLabels(db, columns, record.row.cells)
  const fields = [...columns]
    .sort((left, right) =>
      left.position < right.position ? -1 : left.position > right.position ? 1 : 0,
    )
    .map((column) => ({
      label: column.name,
      value:
        column.type === 'relation'
          ? relationTitle(record.row, column.id)
          : historyLabel(column, record.row.cells[column.id], labels),
    }))
    .filter((field) => field.value !== '')
  const title = record.row.title?.trim() || shell.name
  const notes = plainText(record.row.notes)
  const body = await renderPdf((doc) => {
    heading(doc, title, `${project?.name ?? ''} · ${shell.name}`)
    for (const field of fields) {
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(field.label)
      doc.font('Helvetica').fontSize(11).fillColor(ink).text(field.value)
      doc.moveDown(0.45)
    }
    if (notes) {
      section(doc, 'Notes')
      doc.font('Helvetica').fontSize(11).fillColor(ink).text(notes)
    }
    if (record.links.length > 0) {
      section(doc, 'Linked records')
      for (const link of record.links) {
        const label = link.columnName ? `${link.columnName} · ${link.tableName}` : link.tableName
        doc.font('Helvetica').fontSize(9).fillColor(muted).text(label)
        doc.font('Helvetica').fontSize(11).fillColor(ink).text(link.title)
        doc.moveDown(0.4)
      }
    }
  })
  return { name: fileName(title, 'record'), body }
}

export async function quotePdf(db: AppDatabase, subject: Subject, rowId: string) {
  const summary = await quoteSummary(db, subject, rowId)
  const body = await renderPdf((doc) => {
    heading(doc, summary.title, 'Quote')
    if (summary.customer) pair(doc, 'Customer', summary.customer)
    if (summary.status) pair(doc, 'Status', summary.status)
    section(doc, 'Lines')
    const widths = [230, 80, 90, 90]
    tableRow(doc, ['Product', 'Quantity', 'Price', 'Amount'], widths, true)
    rule(doc)
    for (const item of summary.lines) {
      tableRow(
        doc,
        [item.product, String(item.quantity), money(item.price), money(item.amount)],
        widths,
        false,
      )
    }
    doc.moveDown(0.2)
    rule(doc)
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(ink)
      .text(`Total ${money(summary.total)}`, { align: 'right' })
  })
  return { name: fileName(summary.title, 'quote'), body }
}

function tableRow(doc: PdfDoc, cells: string[], widths: number[], header: boolean) {
  const y = doc.y
  doc
    .font(header ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(header ? 9 : 11)
    .fillColor(header ? muted : ink)
  let height = 0
  let x = margin
  cells.forEach((cell, index) => {
    const width = widths[index] ?? 80
    height = Math.max(height, doc.heightOfString(cell, { width }))
    doc.text(cell, x, y, { width })
    x += width
  })
  doc.y = y + height
  doc.moveDown(0.35)
}

function relationTitle(row: object, columnId: string) {
  if (!('relationLabels' in row) || !row.relationLabels || typeof row.relationLabels !== 'object')
    return ''
  const entry = Object.entries(row.relationLabels).find(([id]) => id === columnId)?.[1]
  if (!entry || typeof entry !== 'object' || !('title' in entry) || typeof entry.title !== 'string')
    return ''
  return entry.title
}

function pair(doc: PdfDoc, label: string, value: string) {
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(label)
  doc.font('Helvetica').fontSize(11).fillColor(ink).text(value)
  doc.moveDown(0.45)
}

function heading(doc: PdfDoc, title: string, subtitle: string) {
  doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(title)
  doc.moveDown(0.15)
  doc.font('Helvetica').fontSize(10).fillColor(muted).text(subtitle)
  doc.moveDown(0.6)
  rule(doc)
  doc.moveDown(0.6)
}

function section(doc: PdfDoc, title: string) {
  doc.moveDown(0.4)
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text(title)
  doc.moveDown(0.35)
}

function rule(doc: PdfDoc) {
  doc
    .moveTo(margin, doc.y)
    .lineTo(doc.page.width - margin, doc.y)
    .strokeColor(line)
    .stroke()
  doc.moveDown(0.35)
}

function money(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function plainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function fileName(title: string, fallback: string) {
  const cleaned = title
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${cleaned || fallback}.pdf`
}

function renderPdf(draw: (doc: PdfDoc) => void) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin, compress: false })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    draw(doc)
    doc.end()
  })
}
