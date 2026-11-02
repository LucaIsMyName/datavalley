import { Slot } from '@radix-ui/react-slot'
import { PanelLeft } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
} from 'react'
import { cn } from '../../lib/utils'
import { Button } from './button'

const SIDEBAR_WIDTH = '15rem'
const SIDEBAR_WIDTH_ICON = '3.5rem'

type SidebarContextValue = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.')
  return context
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [_open, _setOpen] = useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value
      if (onOpenChange) onOpenChange(next)
      else _setOpen(next)
    },
    [onOpenChange, open],
  )
  const toggleSidebar = useCallback(() => {
    setOpen((value) => !value)
  }, [setOpen])
  const state = open ? 'expanded' : 'collapsed'
  const context = useMemo(
    () => ({ state, open, setOpen, toggleSidebar }),
    [state, open, setOpen, toggleSidebar],
  )

  return (
    <SidebarContext.Provider value={context}>
      <div
        className={cn('group/sidebar-wrapper flex min-h-0 w-full', className)}
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  side = 'left',
  collapsible = 'icon',
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  side?: 'left' | 'right'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}) {
  const { state } = useSidebar()

  if (collapsible === 'none') {
    return (
      <div className={cn('hidden h-full w-[var(--sidebar-width)] flex-col bg-card md:flex', className)} {...props}>
        {children}
      </div>
    )
  }

  return (
    <div
      className="group/sidebar peer hidden text-foreground md:block"
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-side={side}
    >
      <div
        className={cn(
          'relative h-screen w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]',
        )}
      />
      <div
        className={cn(
          'group/sidebar-panel fixed inset-y-0 z-40 hidden h-screen w-[var(--sidebar-width)] flex-col overflow-hidden border-r border-border bg-card p-3 transition-[width] duration-200 ease-linear md:flex',
          side === 'left' ? 'left-0' : 'right-0',
          'group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]',
          'group-data-[collapsible=icon]/sidebar:hover:w-[var(--sidebar-width)]',
          className,
        )}
        {...props}
      >
        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, toggleSidebar } = useSidebar()
  return (
    <Button
      type="button"
      variant="ghost"
      data-sidebar="trigger"
      aria-expanded={open}
      className={cn('size-7 shrink-0 px-0', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft className="size-4" />
    </Button>
  )
}

export function SidebarInset({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('relative flex min-w-0 flex-1 flex-col', className)} {...props} />
}

export function SidebarHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-sidebar="header" className={cn('flex flex-col', className)} {...props} />
}

export function SidebarContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="content"
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  )
}

export function SidebarFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-sidebar="footer" className={cn('flex flex-col', className)} {...props} />
}

export function SidebarMenu({ className, ...props }: ComponentProps<'nav'>) {
  return <nav data-sidebar="menu" className={cn('flex flex-col gap-1', className)} {...props} />
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<'div'>) {
  return <div data-sidebar="menu-item" className={cn('relative', className)} {...props} />
}

export function SidebarMenuButton({
  asChild = false,
  className,
  ...props
}: ComponentProps<'button'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-sidebar="menu-button" className={cn(className)} {...props} />
}
