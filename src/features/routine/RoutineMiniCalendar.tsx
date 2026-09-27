import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthDays } from '@/features/calendar/dates'
import { useCalendarStore } from '@/features/calendar/store'
import { useLang, useT } from '@/i18n'
import { LOCALE_TAGS } from '@/i18n/config'
import { parseISODate, shiftMonthKey, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { dayProgress } from './dates'
import { useRoutineStore } from './store'

/** The same date picker is available in the desktop context pane and within the mobile routine page. */
export function RoutineMiniCalendar({
  userId,
  selected,
  onSelect
}: {
  userId: string
  selected: string
  onSelect: (date: string) => void
}) {
  const t = useT()
  const lang = useLang()
  const locale = LOCALE_TAGS[lang]
  const [view, setView] = useState({ anchor: selected, month: selected.slice(0, 7) })
  const month = view.anchor === selected ? view.month : selected.slice(0, 7)
  const { habits, changes, completions, loadedMonths, errorMonths, status } = useRoutineStore()
  const entries = useCalendarStore((s) => s.entries)
  const calendarLoaded = useCalendarStore((s) => s.loadedMonths[month])
  const calendarError = useCalendarStore((s) => s.errorMonths[month])
  const dates = useMemo(() => monthDays(month), [month])
  const today = todayISO()

  useEffect(() => {
    void useCalendarStore.getState().loadMonth(month, userId)
    void useRoutineStore.getState().loadMonth(month, userId)
  }, [month, userId])

  const ready = status === 'ready' && loadedMonths[month] && calendarLoaded
  const failed = status === 'error' || errorMonths[month] || calendarError
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    parseISODate(`${month}-01`)
  )
  const weekdayLabels = Array.from({ length: 7 }, (_, weekday) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, weekday + 1))
  )

  return (
    <section aria-label={t('routine.dayCalendar')}>
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{t('routine.dayCalendar')}</h3>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t('calendar.previous')}
            onClick={() => setView({ anchor: selected, month: shiftMonthKey(month, -1) })}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t('calendar.next')}
            onClick={() => setView({ anchor: selected, month: shiftMonthKey(month, 1) })}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5" aria-label={monthLabel}>
        {weekdayLabels.map((label, index) => (
          <span
            key={index}
            className="py-1 text-center text-[11px] text-muted-foreground"
            aria-label={new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, index + 1))}
          >
            {label}
          </span>
        ))}
        {dates.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} aria-hidden="true" />
          const progress = ready ? dayProgress(date, habits, changes, completions, entries[date], today) : null
          const marked =
            progress?.status === 'done'
              ? 'done'
              : progress?.status === 'missed' || (progress && progress.done > 0 && date <= today)
                ? 'partial'
                : null
          const statusLabel = !ready
            ? t(failed ? 'errors.loadFailed' : 'common.loading')
            : marked === 'done'
              ? t('routine.complete')
              : marked === 'partial'
                ? t('routine.partial')
                : t('calendar.unmarked')
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-current={selected === date ? 'date' : undefined}
              aria-label={`${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parseISODate(date))}: ${statusLabel}`}
              className={cn(
                'relative flex h-9 min-w-0 items-center justify-center rounded-md border border-transparent text-xs tabular transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                selected === date && 'border-primary bg-accent font-medium'
              )}
            >
              {Number(date.slice(-2))}
              {marked && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-1 right-1 size-1.5 rounded-full',
                    marked === 'done' ? 'bg-blue-600' : 'bg-rose-600'
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="size-1.5 rounded-full bg-blue-600" />
          {t('routine.complete')}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-1.5 rounded-full bg-rose-600" />
          {t('routine.partial')}
        </span>
      </div>
      {failed && (
        <p className="mt-2 text-xs text-destructive" role="status">
          {t('errors.loadFailed')}
        </p>
      )}
    </section>
  )
}
