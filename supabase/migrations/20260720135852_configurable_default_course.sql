begin;

alter table public.courses
add column if not exists is_default boolean not null default false;

-- Ensure that only one course can be the default.
create unique index if not exists courses_one_default_idx
on public.courses (is_default)
where is_default = true;

-- Set the current Ecology Coach course as the default.
update public.courses
set is_default = (id = 1);

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

  select c.id
  into target_course_id
  from public.courses c
  where c.is_default = true
    and c.active = true
  limit 1;

  -- Do not prevent registration if no default course is configured.
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

commit;
