import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Tags,
  Target,
  Wallet
} from 'lucide-react'
import { DesktopDayPanel } from '@/app/DesktopDayPanel'
import { EnvBanner } from '@/app/EnvBanner'
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

  return (
    <div className="min-h-dvh lg:flex lg:h-dvh lg:flex-col lg:gap-[3px] lg:overflow-hidden lg:p-[3px]">
      <EnvBanner />
      <header className="hidden h-12 shrink-0 items-center justify-between px-3 lg:flex">
        <div className="flex items-center gap-5">
          <span className="text-sm font-bold tracking-wide">Percorso</span>
          <span className="text-xs text-muted-foreground">
            {sectionGroup} / {activeLabel}
          </span>
        </div>
        {firstName && <span className="text-sm text-muted-foreground">{firstName}</span>}
      </header>

      <div className="min-h-0 flex-1 lg:grid lg:gap-[3px] lg:grid-cols-[3.25rem_14rem_minmax(0,1fr)] xl:grid-cols-[3.25rem_15rem_minmax(0,1fr)_19rem]">
        <nav
          className="hidden min-h-0 flex-col items-center gap-2 rounded-lg border bg-card py-3 lg:flex"
          aria-label={t('workspace.mainNavigation')}
        >
          {[
            {
              label: t('nav.finances'),
              icon: Wallet,
              active: inFinances && section !== 'goals',
              action: () => navigate('/finances')
            },
            {
              label: t('nav.calendar'),
              icon: CalendarDays,
              active: pathname === '/calendar',
              action: () => navigate('/calendar')
            },
            {
              label: t('finance.tabGoals'),
              icon: Target,
              active: inFinances && section === 'goals',
              action: () => openFinance('goals')
            }
          ].map(({ label, icon: Icon, active, action }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={action}
              className={cn(
                'flex size-10 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                active ? 'bg-accent text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="size-5" />
            </button>
          ))}
          <button
            type="button"
            title={t('nav.settings')}
            aria-label={t('nav.settings')}
            aria-current={pathname === '/settings' ? 'page' : undefined}
            onClick={() => navigate('/settings')}
            className={cn(
              'mt-auto flex size-10 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
              pathname === '/settings' ? 'bg-accent text-primary' : 'text-muted-foreground'
            )}
          >
            <Settings className="size-5" />
          </button>
        </nav>

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
          <div className="my-4 border-t" />
          <p className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t('workspace.routine')}
          </p>
          <NavLink
            to="/calendar"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                isActive ? 'bg-accent font-medium text-primary' : 'text-muted-foreground'
              )
            }
          >
            <CalendarDays className="size-4" />
            {t('calendar.title')}
          </NavLink>
        </aside>

        <main className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:rounded-lg lg:border lg:bg-card">
          <div className="sticky top-0 z-10 hidden h-11 items-center border-b bg-card lg:flex">
            <span className="flex h-full items-center gap-2 border-r border-b-2 border-b-primary px-4 text-sm font-medium">
              <CurrentIcon className="size-4 text-primary" />
              {activeLabel}
            </span>
            {pathname !== '/calendar' && (
              <NavLink
                to="/calendar"
                className="flex h-full items-center gap-2 border-r px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <CalendarDays className="size-4" />
                {t('nav.calendar')}
              </NavLink>
            )}
          </div>
          <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 md:px-8 md:pt-8 lg:max-w-none lg:px-6 lg:pt-6 lg:pb-8">
            <header className="mb-5 flex items-center justify-between gap-3 md:mb-6 lg:hidden">
              <span className="text-sm font-bold tracking-wide text-foreground">Percorso</span>
              {firstName ? <span className="text-sm font-light text-muted-foreground">{firstName}</span> : null}
            </header>
            {children}
          </div>
        </main>

        <DesktopDayPanel userId={userId} openGoals={() => openFinance('goals')} />
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
