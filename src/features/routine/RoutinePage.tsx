import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Check, CircleCheck, CircleX, Pencil, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useCalendarStore, type DayStatus } from '@/features/calendar/store'
import { useLang, useT } from '@/i18n'
import { LOCALE_TAGS } from '@/i18n/config'
import { parseISODate, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { completionKey, currentWeekdays, dayProgress, scheduledHabits, type Habit } from './dates'
import { RoutineMiniCalendar } from './RoutineMiniCalendar'
import { routineDate } from './routineDate'
import { useRoutineStore } from './store'

const weekdays = [0, 1, 2, 3, 4, 5, 6]

export function RoutinePage() {
  const t = useT()
  const lang = useLang()
  const locale = LOCALE_TAGS[lang]
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = routineDate(searchParams.get('date'))
  const month = selected.slice(0, 7)
  const [noteEdit, setNoteEdit] = useState({ date: '', value: '' })
  const [clockToday, setClockToday] = useState(todayISO)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [archiving, setArchiving] = useState<Habit | null>(null)
  const entries = useCalendarStore((s) => s.entries)
  const legacyLoaded = useCalendarStore((s) => s.loadedMonths[month])
  const legacyError = useCalendarStore((s) => s.errorMonths[month])
  const savingLegacy = useCalendarStore((s) => s.savingDate)
  const { status, habits, changes, completions, loadedMonths, errorMonths, savingKey } = useRoutineStore()

  useEffect(() => {
    if (!session) return
    void useCalendarStore.getState().loadMonth(month, session.user.id)
    void useRoutineStore.getState().loadMonth(month, session.user.id)
  }, [month, session])
  useEffect(() => {
    const refresh = () => setClockToday(todayISO())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const active = habits.filter((habit) => !habit.archivedOn)
  const selectedHabits = scheduledHabits(selected, habits, changes)
  const selectedProgress = dayProgress(selected, habits, changes, completions, entries[selected], clockToday)
  const selectedEntry = entries[selected]
  const note = noteEdit.date === selected ? noteEdit.value : (selectedEntry?.note ?? '')
  const loaded = legacyLoaded && Boolean(loadedMonths[month]) && status === 'ready'
  const error = legacyError || Boolean(errorMonths[month]) || status === 'error'
  const selectedLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parseISODate(selected))
  const dayLabel = (index: number, width: 'short' | 'narrow' = 'short') =>
    new Intl.DateTimeFormat(locale, { weekday: width }).format(new Date(2024, 0, 1 + index)).replace('.', '')

  const selectDay = (date: string) => {
    setSearchParams({ date })
  }
  const toggle = async (habit: Habit) => {
    if (!selected || !session) return
    const ok = await useRoutineStore.getState().toggleCompletion(habit.id, selected, session.user.id)
    if (!ok) toast.error(t('toasts.saveError'))
  }
  const archive = async () => {
    if (!archiving || !session) return
    const ok = await useRoutineStore.getState().archiveHabit(archiving.id, session.user.id)
    setArchiving(null)
    toast[ok ? 'success' : 'error'](t(ok ? 'toasts.updated' : 'toasts.saveError'))
  }
  const saveLegacy = async (dayStatus: DayStatus | null) => {
    if (!selected || !session || selected >= clockToday) return
    const ok = await useCalendarStore
      .getState()
      .saveDay(selected, dayStatus, dayStatus ? note.trim() : '', session.user.id)
    if (!ok) toast.error(t('toasts.saveError'))
    else if (!dayStatus) setNoteEdit({ date: selected, value: '' })
  }

  return (
    <section className="space-y-5" aria-labelledby="routine-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="routine-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t('routine.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('routine.intro')}</p>
        </div>
        <Button disabled={status !== 'ready'} onClick={() => setAdding(true)}>
          <Plus />
          {t('routine.addHabit')}
        </Button>
      </div>
      {session && (
        <div className="xl:hidden">
          <Card className="p-4">
            <RoutineMiniCalendar userId={session.user.id} selected={selected} onSelect={selectDay} />
          </Card>
        </div>
      )}
      <div id="routine-day">
        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-semibold capitalize">{selectedLabel}</h2>
          {error ? (
            <div className="mt-4 text-sm text-muted-foreground">
              <p>{t('errors.loadFailed')}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => {
                  if (!session) return
                  if (status === 'error') useRoutineStore.getState().reset()
                  void useRoutineStore.getState().loadMonth(month, session.user.id)
                  void useCalendarStore.getState().loadMonth(month, session.user.id)
                }}
              >
                {t('common.retry')}
              </Button>
            </div>
          ) : loaded ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedProgress?.total
                  ? t('routine.progress', { done: selectedProgress.done, total: selectedProgress.total })
                  : t('routine.noHabitsDay')}
              </p>
              {selectedHabits.length > 0 && (
                <div className="mt-5 space-y-2">
                  {selectedHabits.map((habit) => {
                    const checked = Boolean(completions[completionKey(habit.id, selected)])
                    return (
                      <button
                        key={habit.id}
                        type="button"
                        disabled={selected > clockToday || Boolean(savingKey)}
                        onClick={() => void toggle(habit)}
                        aria-pressed={checked}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60"
                      >
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded border',
                            checked && 'border-primary bg-primary text-primary-foreground'
                          )}
                        >
                          {checked && <Check className="size-4" />}
                        </span>
                        <span className={cn('min-w-0 flex-1', checked && 'text-muted-foreground line-through')}>
                          {habit.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {selected > clockToday && <p className="mt-4 text-xs text-muted-foreground">{t('routine.futureRule')}</p>}
              {selectedEntry && (
                <div className="mt-5 border-t pt-4 text-xs text-muted-foreground">
                  <p>
                    {t('routine.previousMark')}:{' '}
                    {t(selectedEntry.status === 'done' ? 'calendar.done' : 'calendar.missed')}
                    {selectedEntry.note ? ` · ${selectedEntry.note}` : ''}
                  </p>
                  {selected < clockToday && selectedHabits.length > 0 && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(savingLegacy)}
                      onClick={() => void saveLegacy(null)}
                    >
                      <RotateCcw />
                      {t('calendar.clear')}
                    </Button>
                  )}
                </div>
              )}
              {selected < clockToday && selectedHabits.length === 0 && (
                <div className="mt-5 border-t pt-4">
                  <p className="mb-3 text-xs text-muted-foreground">{t('routine.legacyHint')}</p>
                  <Field label={t('calendar.note')}>
                    <textarea
                      value={note}
                      onChange={(event) => setNoteEdit({ date: selected, value: event.target.value })}
                      maxLength={500}
                      disabled={Boolean(savingLegacy)}
                      placeholder={t('calendar.noteHint')}
                      className="min-h-20 w-full rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    />
                  </Field>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button disabled={Boolean(savingLegacy)} onClick={() => void saveLegacy('done')}>
                      <CircleCheck />
                      {t('calendar.markDone')}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={Boolean(savingLegacy)}
                      onClick={() => void saveLegacy('missed')}
                    >
                      <CircleX />
                      {t('calendar.markMissed')}
                    </Button>
                  </div>
                  {selectedEntry && (
                    <Button
                      className="mt-2 w-full"
                      variant="ghost"
                      disabled={Boolean(savingLegacy)}
                      onClick={() => void saveLegacy(null)}
                    >
                      <RotateCcw />
                      {t('calendar.clear')}
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              {t('common.loading')}
            </p>
          )}
        </Card>
      </div>
      <Card id="routine-habits" className="p-4 sm:p-5">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{t('routine.yourHabits')}</h2>
          <span className="text-xs text-muted-foreground">{t('routine.activeCount', { count: active.length })}</span>
        </div>
        {status !== 'ready' ? (
          <p className="text-sm text-muted-foreground">
            {t(status === 'error' ? 'errors.loadFailed' : 'common.loading')}
          </p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('routine.emptyHint')}</p>
        ) : (
          <ul className="divide-y">
            {active.map((habit) => (
              <li key={habit.id} className="flex min-h-14 items-center gap-3 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                  <CircleCheck className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{habit.name}</strong>
                  <small className="text-xs text-muted-foreground">
                    {currentWeekdays(habit, changes, clockToday)
                      .map((day) => dayLabel(day, 'narrow'))
                      .join(' · ')}
                  </small>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t('common.edit')}: ${habit.name}`}
                  onClick={() => setEditing(habit)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t('routine.archive')}: ${habit.name}`}
                  onClick={() => setArchiving(habit)}
                >
                  <Archive />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {habits.length > active.length && (
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            {t('routine.archivedCount', { count: habits.length - active.length })}
          </p>
        )}
      </Card>
      {adding && session && <HabitForm userId={session.user.id} onClose={() => setAdding(false)} />}
      {editing && session && <HabitForm habit={editing} userId={session.user.id} onClose={() => setEditing(null)} />}
      {archiving && (
        <ConfirmDialog
          title={t('routine.archive')}
          message={t('routine.archiveConfirm', { name: archiving.name })}
          onCancel={() => setArchiving(null)}
          onConfirm={() => void archive()}
        />
      )}
    </section>
  )
}

function HabitForm({ habit, userId, onClose }: { habit?: Habit; userId: string; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const changes = useRoutineStore((s) => s.changes)
  const [name, setName] = useState(habit?.name ?? '')
  const [days, setDays] = useState(habit ? currentWeekdays(habit, changes) : [0, 1, 2, 3, 4, 5, 6])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const label = (day: number) =>
    new Intl.DateTimeFormat(LOCALE_TAGS[lang], { weekday: 'short' }).format(new Date(2024, 0, 1 + day)).replace('.', '')
  const switchDay = (day: number) =>
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()))
  const create = async () => {
    if (!name.trim() || days.length === 0) {
      setError(t('routine.required'))
      return
    }
    setSaving(true)
    const ok = await useRoutineStore.getState().addHabit(name, days, userId)
    setSaving(false)
    if (ok) {
      toast.success(t('toasts.added'))
      onClose()
    } else toast.error(t('toasts.saveError'))
  }
  const rename = async () => {
    if (!habit || !name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    setSaving(true)
    const ok = await useRoutineStore.getState().renameHabit(habit.id, name, userId)
    setSaving(false)
    toast[ok ? 'success' : 'error'](t(ok ? 'toasts.updated' : 'toasts.saveError'))
    if (ok) onClose()
  }
  const reschedule = async () => {
    if (!habit || days.length === 0) {
      setError(t('routine.required'))
      return
    }
    setSaving(true)
    const ok = await useRoutineStore.getState().changeSchedule(habit.id, days, userId)
    setSaving(false)
    toast[ok ? 'success' : 'error'](t(ok ? 'toasts.updated' : 'toasts.saveError'))
    if (ok) onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t(habit ? 'routine.editHabit' : 'routine.addHabit')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field label={t('common.name')} error={error || undefined}>
            <Input
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              placeholder={t('routine.nameHint')}
              autoFocus
            />
          </Field>
          {habit && (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              disabled={saving || !name.trim() || name.trim() === habit.name}
              onClick={() => void rename()}
            >
              {t('routine.saveName')}
            </Button>
          )}
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">{t('routine.days')}</legend>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {weekdays.map((day) => (
                <label
                  key={day}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-center rounded-md border text-xs font-medium focus-within:outline-2 focus-within:outline-ring',
                    days.includes(day) ? 'border-primary bg-accent text-primary' : 'text-muted-foreground'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={() => {
                      switchDay(day)
                      setError('')
                    }}
                    className="sr-only"
                  />
                  {label(day)}
                </label>
              ))}
            </div>
            {habit && <p className="mt-2 text-xs text-muted-foreground">{t('routine.scheduleHint')}</p>}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={saving || !days.length || (!habit && !name.trim())}
            onClick={() => void (habit ? reschedule() : create())}
          >
            {t(habit ? 'routine.saveDays' : 'common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
