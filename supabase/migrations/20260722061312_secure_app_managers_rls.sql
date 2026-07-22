begin;

-- Enable Row Level Security
alter table public.app_managers
enable row level security;

-- Remove overly broad grants
revoke all
on public.app_managers
from anon, authenticated;

-- Keep service role access
grant all
on public.app_managers
to service_role;

-- Allow authenticated users to determine
-- whether THEY are an app manager.

create policy "Users can view their own manager record"
on public.app_managers
for select
to authenticated
using (
    user_id = auth.uid()
);

commit;
