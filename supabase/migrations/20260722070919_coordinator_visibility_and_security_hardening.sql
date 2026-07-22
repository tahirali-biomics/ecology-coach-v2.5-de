begin;

-- ============================================================================
-- Coordinator authorization helper
-- Recognizes coordinators/admins through course_members rather than only
-- courses.coordinator_id.
-- ============================================================================

create or replace function private.coordinator_can_view_user(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.course_members me
    join public.course_members student
      on student.course_id = me.course_id
    join public.courses c
      on c.id = me.course_id
    where me.user_id = auth.uid()
      and me.role in ('coordinator', 'admin')
      and student.user_id = p_user_id
      and c.active = true
  );
$function$;

-- ============================================================================
-- Lesson-question access
-- ============================================================================

drop policy if exists "Authenticated users can read lesson questions"
on public.lesson_questions;

create policy "Authenticated users can read lesson questions"
on public.lesson_questions
for select
to authenticated
using (true);

-- ============================================================================
-- AI-usage visibility
-- ============================================================================

drop policy if exists "coordinators read student AI usage"
on public.ai_daily_usage;

create policy "coordinators read student AI usage"
on public.ai_daily_usage
for select
to authenticated
using (
  private.coordinator_can_view_user(user_id)
);

-- ============================================================================
-- Lesson attempts
-- ============================================================================

drop policy if exists "Coordinators read course attempts"
on public.lesson_attempts;

drop policy if exists "coordinators read course attempts"
on public.lesson_attempts;

create policy "coordinators read course attempts"
on public.lesson_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.course_members me
    where me.user_id = auth.uid()
      and me.course_id = lesson_attempts.course_id
      and me.role in ('coordinator', 'admin')
  )
);

-- ============================================================================
-- Lesson responses
-- ============================================================================

drop policy if exists "Coordinators read course responses"
on public.lesson_responses;

drop policy if exists "coordinators read course responses"
on public.lesson_responses;

create policy "coordinators read course responses"
on public.lesson_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.lesson_attempts la
    join public.course_members me
      on me.course_id = la.course_id
    where la.id = lesson_responses.attempt_id
      and me.user_id = auth.uid()
      and me.role in ('coordinator', 'admin')
  )
);

commit;
