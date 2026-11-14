import './react-scan-setup'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './lib/i18n'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import { restoreSession, router } from './routes/router'
import { applyTheme } from './stores/session'
import './styles/globals.css'
import 'react-day-picker/style.css'

applyTheme((localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null) ?? 'system')
void restoreSession()

const queryClient = new QueryClient({
  // Table screens use SSE + targeted invalidation; avoid refetching every query on tab focus.
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
