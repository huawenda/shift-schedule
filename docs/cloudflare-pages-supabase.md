# Cloudflare Pages + Supabase Deployment

This project now treats the pure Web app in `apps/web` as the primary
Cloudflare Pages target. The legacy Taro H5 build is no longer the recommended
Web deployment path.

## 1. Supabase project

1. Create a Supabase project.
2. Open `Authentication` -> `Providers` -> `Email`.
3. Keep Email enabled.
4. Disable email confirmation for this private scheduling tool, otherwise a new
   account will not be usable until the generated internal email is confirmed.

The Web UI still shows username/password. Internally it turns the username into
an email such as `zhangsan@shift-schedule.local` for Supabase Auth.

## 2. Database schema

Open Supabase SQL Editor and run:

```sql
-- Copy and run docs/supabase-schema.sql
```

Then set your invite codes:

```sql
update private.registration_settings
set
  user_invite_code = 'your-normal-user-invite-code',
  admin_invite_code = 'your-admin-invite-code',
  admin_person_name = '华文达',
  updated_at = now()
where id = 1;
```

Invite codes live in the private schema and are not bundled into the frontend.

## 3. Cloudflare Pages settings

Recommended Pages settings:

```text
Root directory: /
Build command: pnpm install --frozen-lockfile && pnpm build:web
Build output directory: apps/web/dist
```

Production environment variables:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

Deploy again after adding the variables.

## 4. Local Web development

Create `apps/web/.env.local`:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-key
```

Then start the Web app:

```bash
pnpm dev:web
```

Without these variables, the Web app runs in demo/local mode. Supabase login,
registration, cloud schedule records, and cloud salary input persistence require
the variables above.

## 5. PWA assets

The pure Web app owns its PWA files:

- `apps/web/public/manifest.webmanifest`
- `apps/web/public/service-worker.js`
- `apps/web/public/icons/icon-192.png`
- `apps/web/public/icons/icon-512.png`
- `apps/web/public/_redirects`
- `apps/web/public/_headers`

Cloudflare Pages copies these into `apps/web/dist` during `pnpm build:web`.
`_redirects` provides SPA fallback, and `_headers` keeps the service worker
uncached while adding basic browser security headers.

## 6. Register users

Use the app registration page:

- Admin: choose `华文达` and use `admin_invite_code`.
- Normal user: choose their own name and use `user_invite_code`.

The database enforces one account per person name.

## 7. Disable or remove a user

Use Supabase Table Editor or SQL:

```sql
update public.user_accounts
set enabled = false
where person_name = '张舒祺';
```

Disabled accounts cannot read or write app data because public tables use RLS
policies tied to an enabled account.

## Legacy Taro H5 note

The old Taro H5 scripts still exist while the miniapp line is being contained,
but Cloudflare Pages should use `pnpm build:web` and `apps/web/dist`.
