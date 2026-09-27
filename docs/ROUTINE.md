# Routine

Routine starts with habits. Create a habit, choose its weekdays, and mark it complete on the scheduled day or a past date. Upcoming dates are visible for planning and cannot be completed early. A date turns blue when all its scheduled habits are complete; past dates with missing habits turn red. Today remains in progress until all habits are complete. The month summary counts completed and missed days, not individual checkmarks.

The Home page and desktop day pane show today's habits with the same completion state as the Routine page. The existing calendar route (`/calendar`) and its single sidebar icon remain the entry point. The extra miniature calendar in the day pane has been replaced by today's checklist.

Weekdays use Monday=0 through Sunday=6. A new habit starts today, so it never creates artificial failures in the past. Changing its weekday schedule creates an effective-dated version beginning today; older dates retain their previous schedule. Renaming changes its label, and archiving removes it from future dates while preserving earlier history. Historic whole-day `calendar_days` marks and notes stay visible. On dates with no scheduled habits, those marks can still be corrected or cleared.

The tables `habits`, `habit_schedule_changes`, and `habit_completions` use per-user RLS, explicit Data API grants, and composite owner foreign keys. The UI derives completion totals from stored rows. See `supabase/migrations/20260927130955_routine_habits.sql`. The test, demo, and QA persona seeds include four months of realistic completions. The hosted QA login has been populated without replacing its existing Finance data.
