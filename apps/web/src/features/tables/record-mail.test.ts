// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { MailCompose } from './record-mail'

let provider: ReturnType<typeof createInstance>
let root: Root
let host: HTMLDivElement

describe('mail compose', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            mailTemplate: 'Template',
            mailNoTemplate: 'No template',
            mailTo: 'To',
            mailSubject: 'Subject',
            mailBody: 'Message',
            mailSend: 'Send',
          },
        },
      },
    })
  })

  it('fills the subject from a template and shows the resolved preview', async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(
            QueryClientProvider,
            { client: new QueryClient() },
            createElement(MailCompose, {
            rowId: 'row-1',
            fields: { Name: 'Website' },
            recipients: [{ address: 'ada@northwind.example', label: 'Person · Ada Lovelace', rowId: 'person-1' }],
            templates: [{ id: 'template-1', name: 'Follow up', subject: 'Hello {{Name}}', body: 'Checking in' }],
          }),
          ),
        ),
      )
    })
    const template = host.querySelector('select[aria-label="Template"]') as HTMLSelectElement
    const subject = host.querySelector('input[aria-label="Subject"]') as HTMLInputElement
    await act(async () => {
      template.value = 'template-1'
      template.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(subject.value).toBe('Hello {{Name}}')
    expect(host.textContent).toContain('Hello Website')
    await act(async () => root.unmount())
    host.remove()
  })
})
