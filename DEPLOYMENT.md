# Deployment

1. Create a new GitHub repository.
2. Update `vite.config.ts` so `base` exactly matches `/<repository-name>/`.
3. Add repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. In Settings → Pages, select **GitHub Actions**.
5. Push `main`; the included workflow builds and deploys.

Never commit `.env.local`, Gemini keys or Supabase service-role keys.
