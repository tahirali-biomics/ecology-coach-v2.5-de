-- Automatically enrol newly created student profiles
-- in the default Ecology Coach course.

create or replace function public.auto_enroll_new_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_course_id bigint;
begin
  if coalesce(new.role, 'student') <> 'student' then
    return new;
  end if;

  select id
  into target_course_id
  from public.courses
  where id = 1
  limit 1;

  if target_course_id is null then
    return new;
  end if;

  insert into public.course_members (
    course_id,
    user_id,
    role
  )
  values (
    target_course_id,
    new.id,
    'student'
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists auto_enrol_student_after_profile_insert
on public.profiles;

create trigger auto_enrol_student_after_profile_insert
after insert on public.profiles
for each row
execute function public.auto_enroll_new_student();


-- Backfill existing student profiles that are not yet course members.

insert into public.course_members (
  course_id,
  user_id,
  role
)
select
  1,
  p.id,
  'student'
from public.profiles p
where coalesce(p.role, 'student') = 'student'
  and not exists (
    select 1
    from public.course_members cm
    where cm.course_id = 1
      and cm.user_id = p.id
  )
on conflict do nothing;
