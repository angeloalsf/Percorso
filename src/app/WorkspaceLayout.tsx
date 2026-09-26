import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  PanelRightOpen,
  ReceiptText,
  Settings,
  Tags,
  Target,
  Wallet
} from 'lucide-react'
import { DesktopDayPanel } from '@/app/DesktopDayPanel'
import { useT, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/state/prefs'
import { useProfile } from '@/state/profile'

const FINANCE_SECTIONS: { id: string; labelKey: TKey; icon: typeof Wallet }[] = [
  { id: 'dashboard', labelKey: 'finance.tabDashboard', icon: LayoutDashboard },
  { id: 'transactions', labelKey: 'finance.tabTransactions', icon: ArrowLeftRight },
  { id: 'accounts', labelKey: 'finance.tabAccounts', icon: Landmark },
  { id: 'cards', labelKey: 'finance.tabCards', icon: CreditCard },
  { id: 'budgets', labelKey: 'finance.tabBudgets', icon: ChartNoAxesCombined },
  { id: 'goals', labelKey: 'finance.tabGoals', icon: Target },
  { id: 'bills', labelKey: 'finance.tabBills', icon: ReceiptText },
  { id: 'categories', labelKey: 'finance.tabCategories', icon: Tags }
]

const MOBILE_NAV: { to: string; icon: typeof Wallet; labelKey: TKey }[] = [
  { to: '/finances', icon: Wallet, labelKey: 'nav.finances' },
  { to: '/calendar', icon: CalendarDays, labelKey: 'nav.calendar' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' }
]

interface Props {
  children: ReactNode
  userId: string
  firstName: string
  financeTab: string
  openFinance: (section: string) => void
}

/** Desktop workspace frame. Below lg, the original header, tabs and bottom nav remain. */
export function WorkspaceLayout({ children, userId, firstName, financeTab, openFinance }: Props) {
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [dayViewOpen, setDayViewOpen] = useState(true)
  const t = useT()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const currency = useProfile((s) => s.currency)
  const language = usePrefs((s) => s.language)
  const inFinances = pathname.startsWith('/finances')
  const section = pathname.startsWith('/finances/accounts/') ? 'accounts' : financeTab
  const currentFinanceItem = FINANCE_SECTIONS.find((item) => item.id === section)
  const CurrentIcon = inFinances
    ? (currentFinanceItem?.icon ?? Wallet)
    : pathname === '/calendar'
      ? CalendarDays
      : Settings
  const activeLabel = inFinances
    ? t(currentFinanceItem?.labelKey ?? 'nav.finances')
    : t(pathname === '/calendar' ? 'nav.calendar' : 'nav.settings')
  const sectionGroup = inFinances ? t('nav.finances') : 'Percorso'
  const handleRailAction = (active: boolean, action: () => void): void => {
    if (active) setExplorerOpen((open) => !open)
    else {
      setExplorerOpen(true)
      action()
    }
  }

  return (
    <div className="min-h-dvh lg:flex lg:h-dvh lg:flex-col lg:gap-[3px] lg:overflow-hidden lg:p-[3px]">
      <header className="hidden h-12 shrink-0 items-center justify-between px-3 lg:flex">
        <span className="text-sm font-bold tracking-wide">Percorso</span>
        {firstName && <span className="text-sm text-muted-foreground">{firstName}</span>}
      </header>

      <div
        className={cn(
          'min-h-0 flex-1 lg:grid lg:gap-[3px]',
          explorerOpen ? 'lg:grid-cols-[3.25rem_14rem_minmax(0,1fr)]' : 'lg:grid-cols-[3.25rem_minmax(0,1fr)]',
          explorerOpen && dayViewOpen
            ? 'xl:grid-cols-[3.25rem_15rem_minmax(0,1fr)_19rem]'
            : explorerOpen
              ? 'xl:grid-cols-[3.25rem_15rem_minmax(0,1fr)]'
              : dayViewOpen
                ? 'xl:grid-cols-[3.25rem_minmax(0,1fr)_19rem]'
                : 'xl:grid-cols-[3.25rem_minmax(0,1fr)]'
        )}
      >
        <nav
          className="hidden min-h-0 flex-col items-center gap-2 rounded-lg border bg-card py-3 lg:flex"
          aria-label={t('workspace.mainNavigation')}
        >
          <button
            type="button"
            title={t('nav.finances')}
            aria-label={t('nav.finances')}
            aria-current={inFinances ? 'page' : undefined}
            onClick={() => handleRailAction(inFinances, () => navigate('/finances'))}
            className={cn(
              'flex size-10 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
              inFinances ? 'bg-accent text-primary' : 'text-muted-foreground'
            )}
          >
            <Wallet className="size-5" />
          </button>
          <div className="mt-auto flex w-full flex-col items-center gap-2 px-2">
            <button
              type="button"
              title={t('nav.calendar')}
              aria-label={t('nav.calendar')}
              aria-current={pathname === '/calendar' ? 'page' : undefined}
              onClick={() => handleRailAction(pathname === '/calendar', () => navigate('/calendar'))}
              className={cn(
                'flex size-10 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                pathname === '/calendar' ? 'bg-accent text-primary' : 'text-muted-foreground'
              )}
            >
              <CalendarDays className="size-5" />
            </button>
            <div className="w-full border-t" aria-hidden="true" />
            <button
              type="button"
              title={t('nav.settings')}
              aria-label={t('nav.settings')}
              aria-current={pathname === '/settings' ? 'page' : undefined}
              onClick={() => handleRailAction(pathname === '/settings', () => navigate('/settings'))}
              className={cn(
                'flex size-10 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                pathname === '/settings' ? 'bg-accent text-primary' : 'text-muted-foreground'
              )}
            >
              <Settings className="size-5" />
            </button>
          </div>
        </nav>

        {explorerOpen && (
          <aside
            className="hidden min-h-0 overflow-y-auto rounded-lg border bg-card p-3 lg:block"
            aria-label={t('workspace.explore')}
          >
            <div className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <FolderOpen className="size-4" />
              {t('workspace.explore')}
            </div>
            <p className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t('nav.finances')}
            </p>
            <nav className="space-y-0.5" aria-label={t('nav.finances')}>
              {FINANCE_SECTIONS.map(({ id, labelKey, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openFinance(id)}
                  aria-current={inFinances && section === id ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                    inFinances && section === id ? 'bg-accent font-medium text-primary' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {t(labelKey)}
                </button>
              ))}
            </nav>
          </aside>
        )}

        <main className="min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-lg lg:border lg:bg-card">
          <div className="z-10 hidden h-11 shrink-0 items-center border-b bg-card lg:flex">
            <span className="flex h-full items-center gap-2 border-r border-b-2 border-b-primary px-4 text-sm font-medium">
              <CurrentIcon className="size-4 text-primary" />
              {activeLabel}
            </span>
            {!dayViewOpen && (
              <button
                type="button"
                title={t('workspace.openDayView')}
                aria-label={t('workspace.openDayView')}
                onClick={() => setDayViewOpen(true)}
                className="ml-auto mr-2 hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring xl:flex"
              >
                <PanelRightOpen className="size-4" />
              </button>
            )}
          </div>
          <div className="min-w-0 lg:mr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 md:px-8 md:pt-8 lg:max-w-none lg:px-6 lg:pt-6 lg:pb-8">
              <header className="mb-5 flex items-center justify-between gap-3 md:mb-6 lg:hidden">
                <span className="text-sm font-bold tracking-wide text-foreground">Percorso</span>
                {firstName ? <span className="text-sm font-light text-muted-foreground">{firstName}</span> : null}
              </header>
              {children}
            </div>
          </div>
        </main>

        {dayViewOpen && (
          <DesktopDayPanel
            userId={userId}
            openGoals={() => openFinance('goals')}
            onClose={() => setDayViewOpen(false)}
          />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {MOBILE_NAV.map(({ to, icon: Icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 pt-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="size-5" />
              {t(labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>
      <footer className="hidden h-6 shrink-0 items-center justify-between rounded-md border bg-card px-3 text-[11px] text-muted-foreground lg:flex">
        <span>Percorso</span>
        <span>
          {sectionGroup} / {activeLabel}
        </span>
        <span>
          {language} · {currency}
        </span>
      </footer>
    </div>
  )
}
