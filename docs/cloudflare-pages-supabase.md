# Cloudflare Pages + Supabase Deployment

This project can run without the old Express/PostgreSQL server when the H5 build
is configured with Supabase.

## 1. Create the Supabase project

1. Create a Supabase project.
2. Open `Authentication` -> `Providers` -> `Email`.
3. Keep Email enabled.
4. Disable email confirmation for this private scheduling tool, otherwise a new
   account will not be usable until the hidden generated email is confirmed.

The app still shows username/password. Internally it turns the username into a
private Supabase Auth email such as `zhangsan@shift-schedule.local`.

## 2. Create tables and RLS policies

Open Supabase SQL Editor and run:

```sql
-- Copy and run docs/supabase-schema.sql
```

Then change the invite codes:

```sql
update private.registration_settings
set
  user_invite_code = 'your-normal-user-invite-code',
  admin_invite_code = 'your-admin-invite-code',
  admin_person_name = '华文达',
  updated_at = now()
where id = 1;
```

The invite codes live in the private schema. They are not bundled into the
Cloudflare Pages frontend.

## 3. Configure Cloudflare Pages environment variables

In Cloudflare Pages, open the project settings and add production variables:

```text
TARO_APP_SUPABASE_URL=https://your-project-ref.supabase.co
TARO_APP_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

Build settings:

```text
Build command: pnpm install --frozen-lockfile && pnpm build:h5
Build output directory: dist-h5
```

Deploy again after adding the variables.

## Local development

Create a local-only `.env.local` file:

```text
TARO_APP_SUPABASE_URL=https://your-project-ref.supabase.co
TARO_APP_SUPABASE_ANON_KEY=your-supabase-publishable-key
```

Then start H5 development:

```bash
pnpm dev:h5
```

Without these variables, H5 falls back to the legacy `/api` backend. That is
only useful when the old Express server is running locally.

### Preview PWA on a phone

Mobile browsers require a trusted HTTPS origin for Service Worker and PWA
installation. For local phone testing, create a local development certificate:

```bash
mkdir certs
mkcert -install
mkcert -key-file certs/dev-key.pem -cert-file certs/dev.pem localhost 127.0.0.1 192.168.31.241
```

Replace `192.168.31.241` with your computer's current LAN IP. Install and trust
the mkcert root certificate on the phone, then start:

```bash
pnpm dev:h5:https
```

Open `https://<your-lan-ip>:10086/#/pages/index/index` on the phone.

## 4. Register users

Use the app registration page:

- Admin: choose `华文达` and use `admin_invite_code`.
- Normal user: choose their own name and use `user_invite_code`.

The database enforces one account per person name.

## 5. Disable or remove a user

Use Supabase Table Editor or SQL:

```sql
update public.user_accounts
set enabled = false
where person_name = '张舒祺';
```

Disabled accounts cannot read or write app data because all public tables use
RLS policies tied to an enabled account.
