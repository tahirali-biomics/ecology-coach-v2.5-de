-- Ecology Coach 2.5 full schema
create extension if not exists vector with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'student' check (role in ('student','coordinator','admin')),
  current_level text default 'introductory',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  coordinator_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.semesters (
  id bigint generated always as identity primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.course_members (
  course_id bigint not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student','coordinator')),
  joined_at timestamptz not null default now(),
  primary key(course_id,user_id)
);

create table if not exists public.course_invitations (
  id bigint generated always as identity primary key,
  course_id bigint not null references public.courses(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default now() + interval '14 days',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(course_id,email,status)
);

create table if not exists public.lesson_progress (
  user_id uuid references auth.users(id) on delete cascade,
  lesson_id text not null,
  completed boolean not null default false,
  score numeric,
  updated_at timestamptz not null default now(),
  primary key(user_id,lesson_id)
);
create table if not exists public.conversation_turns (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  mode text not null,
  user_text text not null,
  ai_reply text,
  feedback jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.daily_lessons (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_date date not null default current_date,
  title text not null,
  lesson_data jsonb not null,
  completed boolean not null default false,
  score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,lesson_date)
);
create table if not exists public.user_vocabulary (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  meaning text not null,
  source_mode text,
  source_turn_id bigint references public.conversation_turns(id) on delete set null,
  review_count integer not null default 0,
  confidence integer not null default 0 check(confidence between 0 and 4),
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,term)
);
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,usage_date)
);
create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_limit integer not null default 30,
  max_message_chars integer not null default 4000
);
create table if not exists public.course_documents (
  id bigint generated always as identity primary key,
  title text not null,
  source_name text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.document_chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.course_documents(id) on delete cascade,
  content text not null,
  embedding extensions.vector(768),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.semesters enable row level security;
alter table public.course_members enable row level security;
alter table public.course_invitations enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.conversation_turns enable row level security;
alter table public.daily_lessons enable row level security;
alter table public.user_vocabulary enable row level security;
alter table public.ai_daily_usage enable row level security;
alter table public.user_ai_settings enable row level security;
alter table public.course_documents enable row level security;
alter table public.document_chunks enable row level security;

create or replace function public.is_course_coordinator(p_course_id bigint)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.course_members where course_id=p_course_id and user_id=auth.uid() and role='coordinator')
 or exists(select 1 from public.courses where id=p_course_id and coordinator_id=auth.uid()); $$;

create policy "own profile" on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "visible courses" on public.courses for select to authenticated using(coordinator_id=auth.uid() or exists(select 1 from public.course_members m where m.course_id=id and m.user_id=auth.uid()));
create policy "coordinator courses" on public.courses for all to authenticated using(coordinator_id=auth.uid()) with check(coordinator_id=auth.uid());
create policy "visible semesters" on public.semesters for select to authenticated using(public.is_course_coordinator(course_id) or exists(select 1 from public.course_members m where m.course_id=semesters.course_id and m.user_id=auth.uid()));
create policy "manage semesters" on public.semesters for all to authenticated using(public.is_course_coordinator(course_id)) with check(public.is_course_coordinator(course_id));
create policy "visible members" on public.course_members for select to authenticated using(user_id=auth.uid() or public.is_course_coordinator(course_id));
create policy "manage members" on public.course_members for all to authenticated using(public.is_course_coordinator(course_id)) with check(public.is_course_coordinator(course_id));
create policy "visible invitations" on public.course_invitations for select to authenticated using(public.is_course_coordinator(course_id) or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy "manage invitations" on public.course_invitations for all to authenticated using(public.is_course_coordinator(course_id)) with check(public.is_course_coordinator(course_id));
create policy "own progress" on public.lesson_progress for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "coordinator read progress" on public.lesson_progress for select to authenticated using(exists(select 1 from public.course_members me join public.course_members st on st.course_id=me.course_id where me.user_id=auth.uid() and me.role='coordinator' and st.user_id=lesson_progress.user_id));
create policy "own turns" on public.conversation_turns for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "coordinator read turns" on public.conversation_turns for select to authenticated using(exists(select 1 from public.course_members me join public.course_members st on st.course_id=me.course_id where me.user_id=auth.uid() and me.role='coordinator' and st.user_id=conversation_turns.user_id));
create policy "own daily lessons" on public.daily_lessons for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own vocabulary" on public.user_vocabulary for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own usage" on public.ai_daily_usage for select to authenticated using(user_id=auth.uid());
create policy "own settings" on public.user_ai_settings for select to authenticated using(user_id=auth.uid());
create policy "authenticated documents" on public.course_documents for select to authenticated using(active=true);
create policy "authenticated chunks" on public.document_chunks for select to authenticated using(true);

create or replace function public.accept_course_invitation(p_token uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare inv public.course_invitations; begin
 select * into inv from public.course_invitations where token=p_token and status='pending' and expires_at>now();
 if inv.id is null then raise exception 'Invalid or expired invitation'; end if;
 if lower(inv.email)<>lower(coalesce(auth.jwt()->>'email','')) then raise exception 'Invitation email does not match signed-in account'; end if;
 insert into public.course_members(course_id,user_id,role) values(inv.course_id,auth.uid(),'student') on conflict do nothing;
 update public.course_invitations set status='accepted' where id=inv.id;
 return inv.course_id; end; $$;
grant execute on function public.accept_course_invitation(uuid) to authenticated;

create or replace function public.consume_ai_quota(p_user_id uuid,p_daily_limit integer)
returns table(allowed boolean,request_count integer,daily_limit integer,remaining integer)
language plpgsql security definer set search_path=public as $$ declare c integer; begin
 insert into public.ai_daily_usage(user_id,usage_date,request_count,updated_at) values(p_user_id,current_date,1,now())
 on conflict(user_id,usage_date) do update set request_count=public.ai_daily_usage.request_count+1,updated_at=now()
 where public.ai_daily_usage.request_count<p_daily_limit returning public.ai_daily_usage.request_count into c;
 if c is null then select u.request_count into c from public.ai_daily_usage u where u.user_id=p_user_id and u.usage_date=current_date; return query select false,coalesce(c,p_daily_limit),p_daily_limit,0; end if;
 return query select true,c,p_daily_limit,greatest(p_daily_limit-c,0); end; $$;
revoke all on function public.consume_ai_quota(uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_ai_quota(uuid,integer) to service_role;

create or replace function public.match_document_chunks(query_embedding extensions.vector(768),match_count integer default 5,min_similarity double precision default .42)
returns table(chunk_id bigint,document_id bigint,title text,source_name text,content text,similarity double precision,metadata jsonb)
language sql stable security definer set search_path=public,extensions as $$
 select c.id,d.id,d.title,d.source_name,c.content,1-(c.embedding<=>query_embedding),c.metadata
 from public.document_chunks c join public.course_documents d on d.id=c.document_id
 where d.active=true and 1-(c.embedding<=>query_embedding)>=min_similarity order by c.embedding<=>query_embedding limit greatest(1,least(match_count,12)); $$;
revoke all on function public.match_document_chunks(extensions.vector,integer,double precision) from public,anon,authenticated;
grant execute on function public.match_document_chunks(extensions.vector,integer,double precision) to service_role;


create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)),'student')
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create policy "coordinator read member profiles" on public.profiles for select to authenticated
using(id=auth.uid() or exists(
  select 1 from public.course_members me join public.course_members st on st.course_id=me.course_id
  where me.user_id=auth.uid() and me.role='coordinator' and st.user_id=profiles.id
));

create or replace function public.archive_and_reset_course(
  p_course_id bigint,
  p_new_semester_name text,
  p_delete_learning_data boolean default false
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_course_coordinator(p_course_id) then raise exception 'Coordinator access required'; end if;
  update public.semesters set status='archived' where course_id=p_course_id and status='active';
  insert into public.semesters(course_id,name,status) values(p_course_id,p_new_semester_name,'active');
  if p_delete_learning_data then
    delete from public.lesson_progress where user_id in(select user_id from public.course_members where course_id=p_course_id and role='student');
    delete from public.conversation_turns where user_id in(select user_id from public.course_members where course_id=p_course_id and role='student');
    delete from public.daily_lessons where user_id in(select user_id from public.course_members where course_id=p_course_id and role='student');
    delete from public.user_vocabulary where user_id in(select user_id from public.course_members where course_id=p_course_id and role='student');
    delete from public.ai_daily_usage where user_id in(select user_id from public.course_members where course_id=p_course_id and role='student');
  end if;
end; $$;
grant execute on function public.archive_and_reset_course(bigint,text,boolean) to authenticated;

create index if not exists document_chunks_embedding_hnsw_idx on public.document_chunks using hnsw(embedding vector_cosine_ops);
create index if not exists conversation_turns_user_created_idx on public.conversation_turns(user_id,created_at desc);
create index if not exists lesson_progress_user_updated_idx on public.lesson_progress(user_id,updated_at desc);
