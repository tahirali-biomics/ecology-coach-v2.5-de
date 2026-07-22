begin;

create or replace function public.get_course_lesson_summary(
  p_course_id bigint
)
returns table(
  user_id uuid,
  display_name text,
  lessons_started bigint,
  lessons_completed bigint,
  lessons_mastered bigint,
  objective_questions_answered bigint,
  objective_questions_correct bigint,
  total_attempts bigint,
  last_activity timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  /*
   * Permit:
   *   1. the original owner in courses.coordinator_id, or
   *   2. a coordinator/admin recorded in course_members.
   */
  if not exists (
    select 1
    from public.courses c
    where c.id = p_course_id
      and c.active = true
      and (
        c.coordinator_id = auth.uid()
        or exists (
          select 1
          from public.course_members me
          where me.course_id = c.id
            and me.user_id = auth.uid()
            and me.role in ('coordinator', 'admin')
        )
      )
  ) then
    raise exception 'Coordinator access required';
  end if;

  return query
  select
    cm.user_id,
    coalesce(p.display_name, 'Student')::text,

    count(distinct la.lesson_id)
      filter (where la.id is not null),

    count(distinct la.lesson_id)
      filter (where la.completed = true),

    count(distinct la.lesson_id)
      filter (where la.mastered = true),

    count(lr.id)
      filter (
        where lq.question_type <> 'short_answer'
      ),

    count(lr.id)
      filter (
        where lq.question_type <> 'short_answer'
          and lr.correct = true
      ),

    count(distinct la.id),

    max(
      greatest(
        coalesce(la.last_activity_at, la.started_at),
        coalesce(lr.updated_at, lr.created_at)
      )
    )

  from public.course_members cm

  left join public.profiles p
    on p.id = cm.user_id

  left join public.lesson_attempts la
    on la.course_id = cm.course_id
   and la.user_id = cm.user_id

  left join public.lesson_responses lr
    on lr.attempt_id = la.id

  left join public.lesson_questions lq
    on lq.id = lr.question_id

  where cm.course_id = p_course_id
    and cm.role = 'student'

  group by
    cm.user_id,
    p.display_name

  order by
    p.display_name nulls last;
end;
$function$;

commit;
