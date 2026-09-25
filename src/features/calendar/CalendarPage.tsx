import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLang, useT } from '@/i18n'
import { LOCALE_TAGS } from '@/i18n/config'
import { currentMonthKey, parseISODate, shiftMonthKey, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { monthDays, monthSummary } from './dates'
import { useCalendarStore, type DayStatus } from './store'

const weekdays = [0, 1, 2, 3, 4, 5, 6] // Monday first

export function CalendarPage() {
  const t = useT()
  const lang = useLang()
  const locale = LOCALE_TAGS[lang]
  const { session } = useAuth()
  const [month, setMonth] = useState(currentMonthKey)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [clockToday, setClockToday] = useState(todayISO)
  const entries = useCalendarStore((s) => s.entries)
  const loaded = useCalendarStore((s) => s.loadedMonths[month])
  const loading = useCalendarStore((s) => s.loadingMonths[month])
  const error = useCalendarStore((s) => s.errorMonths[month])
  const savingDate = useCalendarStore((s) => s.savingDate)

  useEffect(() => {
    if (session) void useCalendarStore.getState().loadMonth(month, session.user.id)
  }, [month, session])

  // Update the date when a tab stays open across midnight or returns from the background.
  useEffect(() => {
    const refresh = () => setClockToday(todayISO())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const days = useMemo(() => monthDays(month), [month])

  const selectedEntry = selected ? entries[selected] : undefined
  const eligible = selected !== null && selected < clockToday
  const { done, missed } = useMemo(() => monthSummary(month, entries), [month, entries])
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    parseISODate(`${month}-01`)
  )
  const selectedLabel = selected
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parseISODate(selected))
    : ''

  const selectDay = (date: string) => {
    setSelected(date)
    setNote(entries[date]?.note ?? '')
  }

  const changeMonth = (delta: number) => {
    setMonth((value) => shiftMonthKey(value, delta))
    setSelected(null)
    setNote('')
  }

  const save = async (status: DayStatus | null) => {
    if (!selected || !session || !eligible) return
    const success = await useCalendarStore
      .getState()
      .saveDay(selected, status, status ? note.trim() : '', session.user.id)
    if (!success) toast.error(t('toasts.saveError'))
    else if (!status) setNote('')
  }

  return (
    <section className="space-y-5" aria-labelledby="calendar-title">
      <div>
        <p className="mb-1 text-xs font-semibold tracking-widest text-primary uppercase">
          Percorso / {t('nav.calendar')}
        </p>
        <h1 id="calendar-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t('calendar.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('calendar.intro')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] lg:items-start">
        <Card className="min-w-0 p-3 sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold capitalize" aria-live="polite">
                {monthLabel}
              </h2>
              <p className="text-xs text-muted-foreground">{t('calendar.monthSummary', { done, missed })}</p>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label={t('calendar.previous')} onClick={() => changeMonth(-1)}>
                <ChevronLeft />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('calendar.next')}
                disabled={month >= clockToday.slice(0, 7)}
                onClick={() => changeMonth(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          {error ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <p>{t('errors.loadFailed')}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => session && void useCalendarStore.getState().loadMonth(month, session.user.id)}
              >
                {t('common.retry')}
              </Button>
            </div>
          ) : !loaded || loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground" role="status">
              {t('common.loading')}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 sm:gap-2" aria-label={monthLabel}>
                {weekdays.map((weekday) => (
                  <span
                    key={weekday}
                    className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase sm:text-xs"
                  >
                    {new Intl.DateTimeFormat(locale, { weekday: 'short' })
                      .format(new Date(2024, 0, 1 + weekday))
                      .replace('.', '')}
                  </span>
                ))}
                {days.map((date, index) =>
                  date ? (
                    <button
                      key={date}
                      type="button"
                      disabled={date >= clockToday}
                      onClick={() => selectDay(date)}
                      aria-pressed={selected === date}
                      aria-label={`${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parseISODate(date))}: ${date === clockToday ? t('calendar.today') : entries[date]?.status === 'done' ? t('calendar.done') : entries[date]?.status === 'missed' ? t('calendar.missed') : date > clockToday ? t('calendar.future') : t('calendar.unmarked')}`}
                      className={cn(
                        'relative flex aspect-square min-h-10 items-center justify-center rounded-md border text-sm font-semibold tabular transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-14',
                        entries[date]?.status === 'done'
                          ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-slate-950'
                          : entries[date]?.status === 'missed'
                            ? 'border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500 dark:text-slate-950'
                            : 'border-border bg-secondary/40 text-foreground',
                        date >= clockToday && 'cursor-default opacity-40',
                        selected === date && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                        date < clockToday && 'hover:brightness-95 dark:hover:brightness-110'
                      )}
                    >
                      {Number(date.slice(-2))}
                      {entries[date] && (
                        <span className="sr-only">
                          {entries[date].status === 'done' ? t('calendar.done') : t('calendar.missed')}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span key={`blank-${index}`} aria-hidden="true" />
                  )
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <i className="size-3 rounded-sm bg-blue-600" />
                  {t('calendar.done')}
                </span>
                <span className="flex items-center gap-2">
                  <i className="size-3 rounded-sm bg-rose-600" />
                  {t('calendar.missed')}
                </span>
                <span className="flex items-center gap-2">
                  <i className="size-3 rounded-sm border bg-secondary" />
                  {t('calendar.unmarked')}
                </span>
              </div>
            </>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-semibold">{selected ? selectedLabel : t('calendar.selectDay')}</h2>
          {selected && loaded && !error ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedEntry
                  ? selectedEntry.status === 'done'
                    ? t('calendar.done')
                    : t('calendar.missed')
                  : t('calendar.unmarked')}
              </p>
              <label htmlFor="calendar-note" className="mt-5 block text-sm font-medium">
                {t('calendar.note')}
              </label>
              <textarea
                id="calendar-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                disabled={!eligible || Boolean(savingDate)}
                placeholder={t('calendar.noteHint')}
                className="mt-2 min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  className="h-auto min-h-11 whitespace-normal bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-slate-950"
                  disabled={!eligible || Boolean(savingDate)}
                  onClick={() => void save('done')}
                >
                  <CircleCheck />
                  {t('calendar.markDone')}
                </Button>
                <Button
                  className="h-auto min-h-11 whitespace-normal bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:text-slate-950"
                  disabled={!eligible || Boolean(savingDate)}
                  onClick={() => void save('missed')}
                >
                  <CircleX />
                  {t('calendar.markMissed')}
                </Button>
              </div>
              {selectedEntry && (
                <Button
                  className="mt-2 w-full"
                  variant="ghost"
                  disabled={!eligible || Boolean(savingDate)}
                  onClick={() => void save(null)}
                >
                  <RotateCcw />
                  {t('calendar.clear')}
                </Button>
              )}
              <p className="mt-4 text-xs text-muted-foreground">{t('calendar.yesterdayRule')}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t('calendar.selectHint')}</p>
          )}
        </Card>
      </div>
    </section>
  )
}
