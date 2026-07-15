# Supabase setup

1. Create a new Supabase project for this Version 2.5 deployment.
2. Open SQL Editor and run `supabase/migrations/20260714_ecology_coach_v25.sql`.
3. In Authentication, enable email/password and configure the GitHub Pages site URL and localhost redirect URL.
4. Set Edge Function secrets: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash-lite`.
5. Deploy: `npx supabase functions deploy ai-tutor --project-ref YOUR_PROJECT_REF`.
6. Promote the first coordinator: `update public.profiles set role='coordinator' where id=(select id from auth.users where email='YOUR_EMAIL');`
7. The coordinator can create courses, generate invitation links, inspect cohort progress and archive semesters.
